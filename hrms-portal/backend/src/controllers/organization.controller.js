const crypto = require("crypto");
const pool = require("../config/db");
const { getEmailValidationError } = require("../utils/validation");
const { getActiveSubscription, checkSubscriptionCapacity } = require("../services/subscription.service");

const BRAND_FONTS = ["DM Sans", "Arial", "Georgia", "Trebuchet MS", "Verdana"];

const getOrganizationBranding = async (req, res) => {
  try {
    if (!req.user.organizationId) return res.status(400).json({ message: "This account is not linked to an organization" });
    const result = await pool.query(
      `SELECT id, name, brand_primary_color, brand_sidebar_color, brand_background_color, brand_font,
              brand_logo_data, brand_show_logo
       FROM organizations WHERE id = $1`,
      [req.user.organizationId]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Organization not found" });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Get organization branding error:", error);
    return res.status(500).json({ message: "Unable to load organization branding" });
  }
};

const updateOrganizationBranding = async (req, res) => {
  const { primaryColor, sidebarColor, backgroundColor, font, logoData, showLogo } = req.body;
  const validColor = value => typeof value === "string" && /^#[\da-fA-F]{6}$/.test(value);
  const validLogo = logoData === null || (
    typeof logoData === "string" &&
    logoData.length <= 300000 &&
    /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z\d+/]+=*$/.test(logoData)
  );
  if (!validColor(primaryColor) || !validColor(sidebarColor) || !validColor(backgroundColor)) {
    return res.status(400).json({ message: "Choose valid six-digit hex colors for the main, sidebar, and workspace background." });
  }
  if (!BRAND_FONTS.includes(font)) return res.status(400).json({ message: "Choose one of the available fonts." });
  if (!validLogo) return res.status(400).json({ message: "Use a PNG, JPEG, WebP, or GIF logo file smaller than 200 KB." });
  if (typeof showLogo !== "boolean") return res.status(400).json({ message: "Choose whether to show the organization logo." });

  try {
    const result = await pool.query(
      `UPDATE organizations
       SET brand_primary_color = $1,
           brand_sidebar_color = $2,
           brand_background_color = $3,
           brand_font = $4,
           brand_logo_data = $5,
           brand_show_logo = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING id, name, brand_primary_color, brand_sidebar_color, brand_background_color, brand_font,
                 brand_logo_data, brand_show_logo`,
      [primaryColor, sidebarColor, backgroundColor, font, logoData, showLogo, req.user.organizationId]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Organization not found" });
    return res.json({ message: "Organization branding saved", branding: result.rows[0] });
  } catch (error) {
    console.error("Update organization branding error:", error);
    return res.status(500).json({ message: "Unable to save organization branding" });
  }
};

const getOrganizations = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
          o.id,
          o.name,
          o.code,
          o.email,
          o.phone,
          o.status,
          o.created_at,
          current_sub.plan_name AS subscription_plan,
          current_sub.end_date AS subscription_end_date,
          COUNT(DISTINCT u.id)::int AS user_count,
          COUNT(DISTINCT e.id)::int AS employee_count
       FROM organizations o
       LEFT JOIN users u
         ON u.organization_id = o.id
       LEFT JOIN employees e
         ON e.organization_id = o.id
       LEFT JOIN LATERAL (
         SELECT p.name AS plan_name, s.end_date
         FROM organization_subscriptions s
         JOIN subscription_plans p ON p.id = s.plan_id
         WHERE s.organization_id = o.id
           AND s.status = 'ACTIVE'
           AND s.start_date <= CURRENT_DATE
           AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
         ORDER BY s.start_date DESC, s.id DESC
         LIMIT 1
       ) current_sub ON TRUE
       GROUP BY
          o.id,
          o.name,
          o.code,
          o.email,
          o.phone,
          o.status,
          o.created_at,
          current_sub.plan_name,
          current_sub.end_date
       ORDER BY o.id DESC`
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Get organizations error:", error);

    return res.status(500).json({
      message: "Unable to fetch organizations"
    });
  }
};

const createOrganization = async (req, res) => {
  try {
    const {
      name,
      code,
      email,
      phone
    } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        message: "Organization name and code are required"
      });
    }
    if (email) {
      const emailError = getEmailValidationError(email);
      if (emailError) return res.status(400).json({ message: emailError });
    }

    const result = await pool.query(
      `INSERT INTO organizations (
          name,
          code,
          email,
          phone
       )
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        name.trim(),
        code.trim().toUpperCase(),
        email || null,
        phone || null
      ]
    );

    return res.status(201).json({
      message: "Organization created successfully",
      organization: result.rows[0]
    });
  } catch (error) {
    console.error("Create organization error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        message: "Organization code already exists"
      });
    }

    return res.status(500).json({
      message: "Unable to create organization"
    });
  }
};

const updateOrganizationStatus = async (req, res) => {
  try {
    const {
      status
    } = req.body;

    const allowedStatuses = [
      "ACTIVE",
      "SUSPENDED",
      "CLOSED"
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid organization status"
      });
    }

    const result = await pool.query(
      `UPDATE organizations
       SET status = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [
        status,
        req.params.id
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        message: "Organization not found"
      });
    }

    return res.json({
      message: "Organization status updated",
      organization: result.rows[0]
    });
  } catch (error) {
    console.error("Update organization error:", error);

    return res.status(500).json({
      message: "Unable to update organization"
    });
  }
};

const deleteOrganization = async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM organizations
       WHERE id = $1
       RETURNING id, name, code`,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        message: "Organization not found"
      });
    }

    return res.json({
      message: "Organization deleted",
      organization: result.rows[0]
    });
  } catch (error) {
    console.error("Delete organization error:", error);

    return res.status(500).json({
      message:
        "Unable to delete organization. Remove dependent records or suspend it instead."
    });
  }
};

const createOrganizationAdmin = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const { organizationId, fullName, email } = req.body;

    if (!/^\d+$/.test(String(organizationId || "")) || !Number(organizationId) || typeof fullName !== "string" || !fullName.trim() || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        message: "Organization, name, and email are required"
      });
    }

    const emailError = getEmailValidationError(email);
    if (emailError) return res.status(400).json({ message: emailError });

    const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === "production" ? "" : "http://localhost:5173");
    if (!frontendUrl) return res.status(503).json({ message: "Set FRONTEND_URL to the deployed portal URL before creating invitations." });
    let inviteUrl;
    try {
      const parsedUrl = new URL(frontendUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol) || (process.env.NODE_ENV === "production" && parsedUrl.protocol !== "https:")) throw new Error("invalid URL");
      const invitationLink = new URL("/accept-invite", parsedUrl);
      inviteUrl = `${invitationLink.toString()}#token=${crypto.randomBytes(32).toString("hex")}`;
    } catch {
      return res.status(500).json({ message: "FRONTEND_URL must be a valid portal URL (HTTPS in production)." });
    }
    const rawToken = inviteUrl.split("#token=")[1];
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await client.query("BEGIN");
    transactionStarted = true;
    const organizationResult = await client.query(
      `SELECT id FROM organizations WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE`,
      [organizationId]
    );

    if (!organizationResult.rows.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        message: "Active organization not found"
      });
    }

    const existingUser = await client.query("SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1", [email.trim()]);
    if (existingUser.rows.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ message: "This email already has an account" });
    }

    await client.query(
      `UPDATE organization_admin_invitations
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE organization_id = $1 AND LOWER(email) = LOWER($2)
         AND accepted_at IS NULL AND revoked_at IS NULL`,
      [organizationId, email.trim()]
    );
    const activeSubscription = await getActiveSubscription(client, organizationId);
    if (activeSubscription) {
      const capacity = await checkSubscriptionCapacity(client, organizationId, "users");
      if (!capacity.allowed) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(capacity.status).json({ message: capacity.message });
      }
    }
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await client.query(
      `INSERT INTO organization_admin_invitations
         (organization_id, full_name, email, token_hash, expires_at, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [organizationId, fullName.trim(), email.toLowerCase().trim(), tokenHash, expiresAt, req.user.id]
    );
    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(201).json({
      message: "Organization Admin invitation created. Copy the link and send it to the invited person.",
      inviteUrl,
      expiresAt
    });
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
    console.error("Create organization admin invitation error:", error.message);

    if (error.code === "23505") {
      return res.status(409).json({
        message: "An account already uses this email"
      });
    }

    return res.status(500).json({
      message: "Unable to create Organization Admin"
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getOrganizationBranding,
  updateOrganizationBranding,
  getOrganizations,
  createOrganization,
  updateOrganizationStatus,
  deleteOrganization,
  createOrganizationAdmin
};
