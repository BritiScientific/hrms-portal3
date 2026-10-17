const pool = require("../config/db");

const getSummary = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM employees WHERE organization_id = $1 AND employment_status = 'ACTIVE') AS active_employees,
         (SELECT COUNT(*)::int FROM departments WHERE organization_id = $1 AND status = 'ACTIVE') AS departments,
         (SELECT COUNT(*)::int FROM job_openings WHERE organization_id = $1 AND status = 'OPEN') AS open_jobs,
         (SELECT COUNT(*)::int FROM leave_requests WHERE organization_id = $1 AND status = 'PENDING') AS pending_leaves,
         (SELECT COUNT(*)::int FROM exit_requests WHERE organization_id = $1 AND status = 'PENDING') AS pending_exits,
         (SELECT COUNT(*)::int FROM payroll_records WHERE organization_id = $1 AND status = 'PAID') AS paid_payroll_records`,
      [req.user.organizationId]
    );
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Get HRMS report summary error:", error);
    return res.status(500).json({ message: "Unable to build report summary" });
  }
};

module.exports = { getSummary };
