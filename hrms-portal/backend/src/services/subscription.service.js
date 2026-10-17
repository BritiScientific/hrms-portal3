const LIMIT_COLUMNS = {
  employees: "max_employees",
  users: "max_users",
  candidates: "max_candidates",
  departments: "max_departments"
};

const getActiveSubscription = async (db, organizationId) => {
  const result = await db.query(
    `SELECT s.id AS subscription_id, s.status AS subscription_status,
            s.start_date AS subscription_start_date, s.end_date AS subscription_end_date,
            s.price_at_purchase, s.currency AS subscription_currency,
            p.id AS plan_id, p.name AS plan_name, p.duration_months,
            p.price AS plan_price, p.max_employees, p.max_users,
            p.max_candidates, p.max_departments
     FROM organization_subscriptions s
     JOIN subscription_plans p ON p.id = s.plan_id
     WHERE s.organization_id = $1 AND s.status = 'ACTIVE'
       AND s.start_date <= CURRENT_DATE
       AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
     ORDER BY s.start_date DESC, s.id DESC
     LIMIT 1`,
    [organizationId]
  );
  return result.rows[0] || null;
};

const getUsage = async (db, organizationId, startDate = null) => {
  const result = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM employees
        WHERE organization_id = $1 AND employment_status = 'ACTIVE') AS employees,
       (SELECT COUNT(*)::int FROM users
        WHERE organization_id = $1 AND status = 'ACTIVE')
        + (SELECT COUNT(*)::int FROM organization_admin_invitations
           WHERE organization_id = $1 AND accepted_at IS NULL
             AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP) AS users,
       (SELECT COUNT(*)::int FROM candidates
        WHERE organization_id = $1 AND ($2::date IS NULL OR created_at::date >= $2::date)) AS candidates,
       (SELECT COUNT(*)::int FROM departments
        WHERE organization_id = $1 AND status = 'ACTIVE') AS departments`,
    [organizationId, startDate]
  );
  return result.rows[0];
};

const getSubscriptionSummary = async (db, organizationId) => {
  const subscription = await getActiveSubscription(db, organizationId);
  if (!subscription) return { subscription: null, usage: await getUsage(db, organizationId) };
  return {
    subscription,
    usage: await getUsage(db, organizationId, subscription.subscription_start_date)
  };
};

const checkSubscriptionCapacity = async (db, organizationId, resource) => {
  const limitColumn = LIMIT_COLUMNS[resource];
  if (!limitColumn) throw new Error(`Unknown subscription resource: ${resource}`);

  const { subscription, usage } = await getSubscriptionSummary(db, organizationId);
  if (!subscription) {
    return {
      allowed: false,
      status: 402,
      message: "This organization has no active subscription. Ask the Super Admin to assign a plan."
    };
  }

  const limit = subscription[limitColumn];
  if (limit !== null && Number(usage[resource]) >= Number(limit)) {
    return {
      allowed: false,
      status: 403,
      message: `The ${subscription.plan_name} plan allows ${limit} ${resource}. Contact the Super Admin to upgrade the plan.`
    };
  }

  return { allowed: true, subscription, usage, limit };
};

module.exports = {
  getActiveSubscription,
  getUsage,
  getSubscriptionSummary,
  checkSubscriptionCapacity
};
