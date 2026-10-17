const pool = require("../config/db");
const { getSubscriptionSummary } = require("../services/subscription.service");

const parseLimit = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : Number.NaN;
};

const getPlans = async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM subscription_plans WHERE is_system = FALSE ORDER BY is_active DESC, duration_months, price"
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Get subscription plans error:", error);
    return res.status(500).json({ message: "Unable to fetch subscription plans" });
  }
};

const createPlan = async (req, res) => {
  try {
    const { name, durationMonths, price, currency } = req.body;
    const limits = {
      maxEmployees: parseLimit(req.body.maxEmployees),
      maxUsers: parseLimit(req.body.maxUsers),
      maxCandidates: parseLimit(req.body.maxCandidates),
      maxDepartments: parseLimit(req.body.maxDepartments)
    };
    if (!name?.trim()) return res.status(400).json({ message: "Plan name is required" });
    if (!Number.isInteger(Number(durationMonths)) || Number(durationMonths) < 1) {
      return res.status(400).json({ message: "Plan duration must be at least one month" });
    }
    if (!Number.isFinite(Number(price)) || Number(price) < 0) {
      return res.status(400).json({ message: "Plan price must be zero or greater" });
    }
    if (Object.values(limits).some(Number.isNaN)) {
      return res.status(400).json({ message: "Usage limits must be whole numbers of zero or greater, or left blank for unlimited" });
    }
    const normalizedCurrency = String(currency || "INR").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      return res.status(400).json({ message: "Currency must be a three-letter code, such as INR or USD" });
    }

    const result = await pool.query(
      `INSERT INTO subscription_plans
         (name, duration_months, price, currency, max_employees, max_users,
          max_candidates, max_departments)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name.trim(), Number(durationMonths), Number(price), normalizedCurrency,
        limits.maxEmployees, limits.maxUsers, limits.maxCandidates, limits.maxDepartments]
    );
    return res.status(201).json({ message: "Subscription plan created", plan: result.rows[0] });
  } catch (error) {
    console.error("Create subscription plan error:", error);
    if (error.code === "23505") return res.status(409).json({ message: "A plan with that name already exists" });
    return res.status(500).json({ message: "Unable to create subscription plan" });
  }
};

const updatePlanStatus = async (req, res) => {
  try {
    const isActive = req.body.isActive;
    if (typeof isActive !== "boolean") return res.status(400).json({ message: "Plan active status must be true or false" });
    const result = await pool.query(
      `UPDATE subscription_plans SET is_active = $1
       WHERE id = $2 AND is_system = FALSE RETURNING *`,
      [isActive, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Plan not found" });
    return res.json({ message: isActive ? "Plan activated" : "Plan deactivated", plan: result.rows[0] });
  } catch (error) {
    console.error("Update subscription plan error:", error);
    return res.status(500).json({ message: "Unable to update subscription plan" });
  }
};

const getSubscriptions = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, o.name AS organization_name, o.code AS organization_code,
              p.name AS plan_name, p.duration_months,
              p.max_employees, p.max_users, p.max_candidates, p.max_departments
       FROM organization_subscriptions s
       JOIN organizations o ON o.id = s.organization_id
       JOIN subscription_plans p ON p.id = s.plan_id
       WHERE p.is_system = FALSE
       ORDER BY s.created_at DESC, s.id DESC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Get organization subscriptions error:", error);
    return res.status(500).json({ message: "Unable to fetch organization subscriptions" });
  }
};

const assignSubscription = async (req, res) => {
  const client = await pool.connect();
  try {
    const { organizationId, planId, startDate } = req.body;
    if (!organizationId || !planId) return res.status(400).json({ message: "Organization and plan are required" });

    await client.query("BEGIN");
    const organization = await client.query(
      "SELECT id FROM organizations WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE",
      [organizationId]
    );
    if (!organization.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Active organization not found" });
    }
    const plan = await client.query(
      "SELECT id, duration_months, price, currency FROM subscription_plans WHERE id = $1 AND is_active = TRUE AND is_system = FALSE",
      [planId]
    );
    if (!plan.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Active subscription plan not found" });
    }
    const start = startDate || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || Number.isNaN(Date.parse(`${start}T00:00:00Z`)) || start > new Date().toISOString().slice(0, 10)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Subscription start date must be a valid date today or earlier" });
    }

    await client.query(
      "UPDATE organization_subscriptions SET status = 'CANCELLED' WHERE organization_id = $1 AND status = 'ACTIVE'",
      [organizationId]
    );
    const assigned = await client.query(
      `INSERT INTO organization_subscriptions
         (organization_id, plan_id, start_date, end_date, status,
          price_at_purchase, currency, created_by_user_id)
       SELECT $1, p.id, $3::date,
              ($3::date + make_interval(months => p.duration_months) - INTERVAL '1 day')::date,
              'ACTIVE', p.price, p.currency, $4
       FROM subscription_plans p WHERE p.id = $2
       RETURNING *`,
      [organizationId, planId, start, req.user.id]
    );
    await client.query("COMMIT");
    return res.status(201).json({ message: "Subscription assigned to organization", subscription: assigned.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Assign subscription error:", error);
    return res.status(500).json({ message: "Unable to assign subscription" });
  } finally {
    client.release();
  }
};

const getMySubscription = async (req, res) => {
  try {
    const summary = await getSubscriptionSummary(pool, req.user.organizationId);
    return res.json(summary);
  } catch (error) {
    console.error("Get current organization subscription error:", error);
    return res.status(500).json({ message: "Unable to fetch subscription and usage" });
  }
};

module.exports = { getPlans, createPlan, updatePlanStatus, getSubscriptions, assignSubscription, getMySubscription };
