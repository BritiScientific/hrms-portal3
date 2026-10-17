const pool = require("../config/db");
const { notifyEmployee, notifyDepartmentManager } = require("../services/notification.service");

const getMyLeaves = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, reviewer.full_name AS reviewer_name
       FROM users employee_user
       JOIN leave_requests l ON l.employee_id = employee_user.employee_id
       LEFT JOIN users reviewer ON reviewer.id = l.reviewed_by_user_id
       WHERE employee_user.id = $1 AND l.organization_id = $2
       ORDER BY l.created_at DESC`,
      [req.user.id, req.user.organizationId]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Get own leave requests error:", error);
    return res.status(500).json({ message: "Unable to fetch leave requests" });
  }
};

const createMyLeave = async (req, res) => {
  try {
    const { leaveType, startDate, endDate, reason } = req.body;
    if (!req.user.employeeId) return res.status(400).json({ message: "This login is not linked to an employee record" });
    if (!leaveType || !startDate || !endDate || !reason || endDate < startDate) {
      return res.status(400).json({ message: "Leave type, valid dates, and reason are required" });
    }
    const result = await pool.query(
      `INSERT INTO leave_requests (organization_id, employee_id, leave_type, start_date, end_date, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.organizationId, req.user.employeeId, leaveType, startDate, endDate, reason.trim()]
    );
    await notifyDepartmentManager(req.user.organizationId, req.user.employeeId, "Leave request needs review", `${leaveType} leave requested from ${startDate} to ${endDate}.`);
    return res.status(201).json({ message: "Leave request submitted", leave: result.rows[0] });
  } catch (error) {
    console.error("Create leave request error:", error);
    return res.status(500).json({ message: "Unable to submit leave request" });
  }
};

const getReviewQueue = async (req, res) => {
  try {
    const managerOnly = req.user.role === "MANAGER";
    const result = await pool.query(
      `SELECT l.*, e.employee_code,
              CONCAT(e.first_name, ' ', COALESCE(e.last_name, '')) AS employee_name,
              d.name AS department_name
       FROM leave_requests l
       JOIN employees e ON e.id = l.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE l.organization_id = $1
         AND ($2 = FALSE OR d.manager_user_id = $3)
       ORDER BY l.created_at DESC`,
      [req.user.organizationId, managerOnly, req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Get leave review queue error:", error);
    return res.status(500).json({ message: "Unable to fetch leave requests" });
  }
};

const reviewLeave = async (req, res) => {
  try {
    const { status, reviewNote } = req.body;
    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ message: "Review status must be APPROVED or REJECTED" });
    }
    const managerOnly = req.user.role === "MANAGER";
    const result = await pool.query(
      `UPDATE leave_requests l
       SET status = $1, review_note = $2,
           reviewed_by_user_id = $3, reviewed_at = CURRENT_TIMESTAMP
       WHERE l.id = $4 AND l.organization_id = $5 AND l.status = 'PENDING'
         AND ($6 = FALSE OR EXISTS (
           SELECT 1 FROM employees e JOIN departments d ON d.id = e.department_id
           WHERE e.id = l.employee_id AND d.manager_user_id = $3
         ))
       RETURNING l.*`,
      [status, reviewNote || null, req.user.id, req.params.id, req.user.organizationId, managerOnly]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Pending leave request not found in your approval scope" });
    await notifyEmployee(req.user.organizationId, result.rows[0].employee_id, "Leave request reviewed", `Your leave request was ${status.toLowerCase()}.`);
    return res.json({ message: `Leave request ${status.toLowerCase()}`, leave: result.rows[0] });
  } catch (error) {
    console.error("Review leave request error:", error);
    return res.status(500).json({ message: "Unable to review leave request" });
  }
};

module.exports = { getMyLeaves, createMyLeave, getReviewQueue, reviewLeave };
