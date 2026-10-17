const pool = require("../config/db");
const { notifyEmployee } = require("../services/notification.service");

const getPayroll = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, e.employee_code,
              CONCAT(e.first_name, ' ', COALESCE(e.last_name, '')) AS employee_name
       FROM payroll_records p JOIN employees e ON e.id = p.employee_id
       WHERE p.organization_id = $1 ORDER BY p.period_start DESC, employee_name`,
      [req.user.organizationId]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Get payroll error:", error);
    return res.status(500).json({ message: "Unable to fetch payroll records" });
  }
};

const getMyPayroll = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.* FROM users u JOIN payroll_records p ON p.employee_id = u.employee_id
       WHERE u.id = $1 ORDER BY p.period_start DESC`, [req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Get employee payroll error:", error);
    return res.status(500).json({ message: "Unable to fetch your payslips" });
  }
};

const createPayroll = async (req, res) => {
  try {
    const { employeeId, periodStart, grossPay, deductions, currency } = req.body;
    const gross = Number(grossPay);
    const deductionAmount = Number(deductions || 0);
    if (!employeeId || !periodStart || !Number.isFinite(gross) || !Number.isFinite(deductionAmount) || gross < 0 || deductionAmount < 0 || deductionAmount > gross) {
      return res.status(400).json({ message: "Provide a valid employee, payroll month, gross pay, and deductions not greater than gross pay" });
    }
    const result = await pool.query(
      `INSERT INTO payroll_records (organization_id, employee_id, period_start, gross_pay, deductions, net_pay, currency, created_by_user_id)
       SELECT $1, e.id, date_trunc('month', $3::date)::date, $4, $5, $4 - $5, $6, $7
       FROM employees e WHERE e.id = $2 AND e.organization_id = $1 RETURNING *`,
      [req.user.organizationId, employeeId, periodStart, gross, deductionAmount, currency || "INR", req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Employee not found" });
    await notifyEmployee(req.user.organizationId, employeeId, "Payslip published", `Your ${periodStart} payroll record is available.`);
    return res.status(201).json({ message: "Payroll record created", payroll: result.rows[0] });
  } catch (error) {
    console.error("Create payroll record error:", error);
    if (error.code === "23505") return res.status(409).json({ message: "Payroll already exists for that employee and month" });
    return res.status(500).json({ message: "Unable to create payroll record" });
  }
};

const markPaid = async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE payroll_records SET status = 'PAID', paid_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organization_id = $2 AND status = 'DRAFT' RETURNING *`,
      [req.params.id, req.user.organizationId]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Draft payroll record not found" });
    await notifyEmployee(req.user.organizationId, result.rows[0].employee_id, "Payroll payment recorded", `Your ${String(result.rows[0].period_start).slice(0, 7)} pay is marked paid.`);
    return res.json({ message: "Payroll marked as paid", payroll: result.rows[0] });
  } catch (error) {
    console.error("Mark payroll paid error:", error);
    return res.status(500).json({ message: "Unable to update payroll status" });
  }
};

module.exports = { getPayroll, getMyPayroll, createPayroll, markPaid };
