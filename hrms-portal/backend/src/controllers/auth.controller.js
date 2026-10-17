const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const pool = require("../config/db");
const { createToken } = require("../utils/jwt");
const { getEmailValidationError, getPasswordValidationError } = require("../utils/validation");
const { getActiveSubscription, checkSubscriptionCapacity } = require("../services/subscription.service");
const { isEmailConfigured, sendPasswordResetCode } = require("../services/email.service");

const hashPasswordResetCode = (userId, code) => crypto
  .createHmac("sha256", process.env.JWT_SECRET)
  .update(`${userId}:${code}`)
  .digest("hex");

const requestPasswordReset = async (req, res) => {
  try {
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    const emailError = getEmailValidationError(email);
    if (emailError) return res.status(400).json({ message: emailError });
    if (!isEmailConfigured() || !process.env.JWT_SECRET) {
      return res.status(503).json({ message: "Password reset email is not configured. Contact your administrator." });
    }

    const userResult = await pool.query(
      "SELECT id, email FROM users WHERE LOWER(email) = $1 AND status = 'ACTIVE' LIMIT 1",
      [email]
    );
    if (!userResult.rows.length) {
      return res.json({ message: "If an active account uses this email, a reset code will be sent." });
    }

    const user = userResult.rows[0];
    const code = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
    const codeHash = hashPasswordResetCode(user.id, code);
    const resetResult = await pool.query(
      `INSERT INTO password_reset_otps (user_id, code_hash, expires_at, attempts, created_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '10 minutes', 0, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE
       SET code_hash = EXCLUDED.code_hash,
           expires_at = EXCLUDED.expires_at,
           attempts = 0,
           created_at = EXCLUDED.created_at
       WHERE password_reset_otps.created_at <= CURRENT_TIMESTAMP - INTERVAL '1 minute'
       RETURNING user_id`,
      [user.id, codeHash]
    );
    if (!resetResult.rows.length) {
      return res.json({ message: "If an active account uses this email, a reset code will be sent." });
    }

    try {
      await sendPasswordResetCode(user.email, code);
    } catch (error) {
      await pool.query(
        "DELETE FROM password_reset_otps WHERE user_id = $1 AND code_hash = $2",
        [user.id, codeHash]
      );
      throw error;
    }

    return res.json({ message: "If an active account uses this email, a reset code will be sent." });
  } catch (error) {
    console.error("Request password reset error:", error);
    return res.status(500).json({ message: "Unable to send a password reset code. Try again later." });
  }
};

const confirmPasswordReset = async (req, res) => {
  let client;
  let transactionStarted = false;
  try {
    const { email, code, password, confirmPassword } = req.body || {};
    const emailError = getEmailValidationError(email);
    const passwordError = getPasswordValidationError(password);
    if (emailError || passwordError) return res.status(400).json({ message: emailError || passwordError });
    if (typeof password !== "string" || typeof confirmPassword !== "string") {
      return res.status(400).json({ message: "Enter a valid new password and confirmation." });
    }
    if (password !== confirmPassword) return res.status(400).json({ message: "The passwords do not match." });
    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ message: "Password reset is not configured. Contact your administrator." });
    }
    if (!/^\d{6}$/.test(String(code || ""))) {
      return res.status(400).json({ message: "The reset code is invalid or expired." });
    }

    const emailAddress = String(email).trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    const result = await client.query(
      `SELECT u.id, o.code_hash, o.expires_at, o.attempts
       FROM users u
       JOIN password_reset_otps o ON o.user_id = u.id
       WHERE LOWER(u.email) = $1 AND u.status = 'ACTIVE'
       FOR UPDATE OF o`,
      [emailAddress]
    );
    const reset = result.rows[0];
    if (!reset || Number(reset.attempts) >= 5 || new Date(reset.expires_at) <= new Date()) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({ message: "The reset code is invalid or expired." });
    }

    const expectedHash = Buffer.from(hashPasswordResetCode(reset.id, String(code)), "hex");
    const storedHash = Buffer.from(reset.code_hash, "hex");
    if (expectedHash.length !== storedHash.length || !crypto.timingSafeEqual(expectedHash, storedHash)) {
      await client.query(
        "UPDATE password_reset_otps SET attempts = attempts + 1 WHERE user_id = $1",
        [reset.id]
      );
      await client.query("COMMIT");
      transactionStarted = false;
      return res.status(400).json({ message: "The reset code is invalid or expired." });
    }

    await client.query("UPDATE users SET password = $1 WHERE id = $2", [passwordHash, reset.id]);
    await client.query("DELETE FROM password_reset_otps WHERE user_id = $1", [reset.id]);
    await client.query("COMMIT");
    transactionStarted = false;
    return res.json({ message: "Your password has been reset. You can now sign in." });
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
    console.error("Confirm password reset error:", error);
    return res.status(500).json({ message: "Unable to reset the password. Try again later." });
  } finally {
    if (client) client.release();
  }
};

const getSetupStatus = async (_req, res) => {
  try {
    const result = await pool.query("SELECT EXISTS (SELECT 1 FROM users WHERE role = 'SUPER_ADMIN') AS has_super_admin");
    const bootstrapKey = process.env.SUPER_ADMIN_BOOTSTRAP_KEY || "";
    return res.json({ setupAvailable: !result.rows[0].has_super_admin && bootstrapKey.length >= 32 });
  } catch (error) {
    console.error("Get setup status error:", error.message);
    return res.status(500).json({ message: "Unable to check administrator setup" });
  }
};

const setupFirstUser = async (req, res) => {
  let client;
  let transactionStarted = false;
  try {
    const { fullName, email, password, bootstrapKey } = req.body || {};
    const expectedKey = process.env.SUPER_ADMIN_BOOTSTRAP_KEY || "";
    const supplied = Buffer.from(String(bootstrapKey || ""));
    const expected = Buffer.from(expectedKey);
    if (expected.length < 32) return res.status(503).json({ message: "Administrator bootstrap is disabled. Configure a one-time bootstrap key first." });
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      return res.status(403).json({ message: "Invalid administrator bootstrap key" });
    }

    if (!fullName || !email || !password) {
      return res.status(400).json({
        message:
          "Full name, email, and password are required"
      });
    }

    const emailError = getEmailValidationError(email);
    const passwordError = getPasswordValidationError(password);
    if (emailError || passwordError) {
      return res.status(400).json({ message: emailError || passwordError });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("SELECT pg_advisory_xact_lock(741935211)");
    const countResult = await client.query("SELECT COUNT(*)::int AS total FROM users WHERE role = 'SUPER_ADMIN'");

    if (countResult.rows[0].total > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({
        message: "Initial setup is already completed"
      });
    }

    const hashedPassword = await bcrypt.hash(
      password,
      12
    );

    const result = await client.query(
      `INSERT INTO users (
          organization_id,
          full_name,
          email,
          password,
          role
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING
          id,
          full_name,
          email,
          role,
          organization_id`,
      [
        null,
        fullName.trim(),
        email.toLowerCase().trim(),
        hashedPassword,
        "SUPER_ADMIN"
      ]
    );
    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(201).json({
      message: "First user created successfully",
      user: result.rows[0]
    });
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
    console.error("Setup first user error:", error.message);

    if (error.code === "23505") {
      return res.status(409).json({
        message: "Email already exists"
      });
    }

    return res.status(500).json({
      message: "Unable to create first user"
    });
  } finally {
    if (client) client.release();
  }
};

const previewOrganizationAdminInvitation = async (req, res) => {
  try {
    const rawToken = String(req.body.token || "");
    if (!/^[a-f0-9]{64}$/i.test(rawToken)) return res.status(400).json({ message: "Invitation link is invalid or expired" });
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const result = await pool.query(
      `SELECT i.full_name, i.email, o.name AS organization_name, i.expires_at
       FROM organization_admin_invitations i
       JOIN organizations o ON o.id = i.organization_id AND o.status = 'ACTIVE'
       WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL
         AND i.expires_at > CURRENT_TIMESTAMP`,
      [tokenHash]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Invitation link is invalid or expired" });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Preview organization admin invitation error:", error.message);
    return res.status(500).json({ message: "Unable to check this invitation" });
  }
};

const acceptOrganizationAdminInvitation = async (req, res) => {
  let client;
  let transactionStarted = false;
  try {
    const rawToken = String((req.body || {}).token || "");
    const { password } = req.body || {};
    if (!/^[a-f0-9]{64}$/i.test(rawToken)) return res.status(400).json({ message: "Invitation link is invalid or expired" });
    const passwordError = getPasswordValidationError(password);
    if (passwordError) return res.status(400).json({ message: passwordError });

    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const invitationOrg = await pool.query(
      "SELECT organization_id FROM organization_admin_invitations WHERE token_hash = $1",
      [tokenHash]
    );
    if (!invitationOrg.rows.length) return res.status(404).json({ message: "Invitation link is invalid or expired" });

    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    const organizationId = invitationOrg.rows[0].organization_id;
    const organization = await client.query(
      "SELECT id FROM organizations WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE",
      [organizationId]
    );
    const inviteResult = await client.query(
      `SELECT id, organization_id, full_name, email
       FROM organization_admin_invitations
       WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
       FOR UPDATE`,
      [tokenHash]
    );
    if (!organization.rows.length || !inviteResult.rows.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({ message: "Invitation link is invalid or expired" });
    }

    const invitation = inviteResult.rows[0];
    await client.query("UPDATE organization_admin_invitations SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1", [invitation.id]);
    const activeSubscription = await getActiveSubscription(client, organizationId);
    if (activeSubscription) {
      const capacity = await checkSubscriptionCapacity(client, organizationId, "users");
      if (!capacity.allowed) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(capacity.status).json({ message: capacity.message });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await client.query(
      `INSERT INTO users (organization_id, full_name, email, password, role)
       VALUES ($1, $2, $3, $4, 'ORG_ADMIN')
       RETURNING id, full_name, email, role, organization_id`,
      [invitation.organization_id, invitation.full_name, invitation.email, hashedPassword]
    );
    await client.query("UPDATE organization_admin_invitations SET accepted_at = CURRENT_TIMESTAMP WHERE id = $1", [invitation.id]);
    await client.query("COMMIT");
    transactionStarted = false;
    return res.status(201).json({ message: "Organization Admin account created. You can now sign in.", user: user.rows[0] });
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
    console.error("Accept organization admin invitation error:", error.message);
    if (error.code === "23505") return res.status(409).json({ message: "This email already has an account. Ask the Super Admin to invite a different email." });
    return res.status(500).json({ message: "Unable to accept this invitation" });
  } finally {
    if (client) client.release();
  }
};

const login = async (req, res) => {
  try {
    const {
      email,
      password
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message:
          "Email and password are required"
      });
    }

    const result = await pool.query(
      `SELECT
          u.*,
          o.name AS organization_name
       FROM users u
       LEFT JOIN organizations o
         ON o.id = u.organization_id
       WHERE LOWER(u.email) = LOWER($1)
         AND u.status = 'ACTIVE'
       LIMIT 1`,
      [email]
    );

    if (!result.rows.length) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    const user = result.rows[0];

    const passwordMatched =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!passwordMatched) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    await pool.query(
      `UPDATE users
       SET last_login_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [user.id]
    );

    const token = createToken(user);

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        profilePicture: user.profile_picture,
        organizationId: user.organization_id,
        employeeId: user.employee_id,
        departmentId: user.department_id,
        organizationName:
          user.organization_name
      }
    });
  } catch (error) {
    console.error(
      "Login error:",
      error
    );

    return res.status(500).json({
      message: "Login failed"
    });
  }
};

module.exports = {
  getSetupStatus,
  setupFirstUser,
  login,
  requestPasswordReset,
  confirmPasswordReset,
  previewOrganizationAdminInvitation,
  acceptOrganizationAdminInvitation
};
