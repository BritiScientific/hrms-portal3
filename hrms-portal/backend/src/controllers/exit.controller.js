const pool = require("../config/db");
const { notifyEmployee, notifyDepartmentManager } = require("../services/notification.service");

const getMyExits = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT x.* FROM users u JOIN exit_requests x ON x.employee_id = u.employee_id
       WHERE u.id = $1 ORDER BY x.created_at DESC`, [req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Get own exit requests error:", error);
    return res.status(500).json({ message: "Unable to fetch exit requests" });
  }
};

const createExit = async (req, res) => {
  try {
    const { reason, lastWorkingDate } = req.body;
    if (!req.user.employeeId) return res.status(400).json({ message: "This login is not linked to an employee" });
    if (!reason || !lastWorkingDate) return res.status(400).json({ message: "Reason and proposed last working date are required" });
    const result = await pool.query(
      `INSERT INTO exit_requests (organization_id, employee_id, reason, last_working_date)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.organizationId, req.user.employeeId, reason.trim(), lastWorkingDate]
    );
    await notifyDepartmentManager(req.user.organizationId, req.user.employeeId, "Exit request needs review", `Proposed last working day: ${lastWorkingDate}.`);
    return res.status(201).json({ message: "Exit request submitted", request: result.rows[0] });
  } catch (error) {
    console.error("Create exit request error:", error);
    return res.status(500).json({ message: "Unable to submit exit request" });
  }
};

const getExits = async (req, res) => {
  try {
    const managerOnly = req.user.role === "MANAGER";
    const result = await pool.query(
      `SELECT x.*, e.employee_code,
              CONCAT(e.first_name, ' ', COALESCE(e.last_name, '')) AS employee_name,
              d.name AS department_name
       FROM exit_requests x JOIN employees e ON e.id = x.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE x.organization_id = $1 AND ($2 = FALSE OR d.manager_user_id = $3)
       ORDER BY x.created_at DESC`,
      [req.user.organizationId, managerOnly, req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Get exit requests error:", error);
    return res.status(500).json({ message: "Unable to fetch exit requests" });
  }
};

const reviewExit = async (req, res) => {
  try {
    const { status, reviewNote } = req.body;
    if (!["APPROVED", "REJECTED"].includes(status)) return res.status(400).json({ message: "Choose approve or reject" });
    const managerOnly = req.user.role === "MANAGER";
    const result = await pool.query(
      `UPDATE exit_requests x SET status = $1, review_note = $2,
         reviewed_by_user_id = $3, reviewed_at = CURRENT_TIMESTAMP
       WHERE x.id = $4 AND x.organization_id = $5 AND x.status = 'PENDING'
         AND ($6 = FALSE OR EXISTS (
           SELECT 1 FROM employees e JOIN departments d ON d.id = e.department_id
           WHERE e.id = x.employee_id AND d.manager_user_id = $3
         )) RETURNING x.*`,
      [status, reviewNote || null, req.user.id, req.params.id, req.user.organizationId, managerOnly]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Pending exit request not found in your scope" });
    await notifyEmployee(req.user.organizationId, result.rows[0].employee_id, "Exit request reviewed", `Your exit request was ${status.toLowerCase()}.`);
    return res.json({ message: "Exit request reviewed", request: result.rows[0] });
  } catch (error) {
    console.error("Review exit request error:", error);
    return res.status(500).json({ message: "Unable to review exit request" });
  }
};

module.exports = { getMyExits, createExit, getExits, reviewExit };
