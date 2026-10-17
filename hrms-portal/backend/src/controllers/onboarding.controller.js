const pool = require("../config/db");
const { notifyEmployee } = require("../services/notification.service");

const getTasks = async (req, res) => {
  try {
    const managerOnly = req.user.role === "MANAGER";
    const result = await pool.query(
      `SELECT t.*, e.employee_code,
              CONCAT(e.first_name, ' ', COALESCE(e.last_name, '')) AS employee_name
       FROM onboarding_tasks t JOIN employees e ON e.id = t.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE t.organization_id = $1 AND ($2 = FALSE OR d.manager_user_id = $3)
       ORDER BY t.due_date NULLS LAST, t.id DESC`,
      [req.user.organizationId, managerOnly, req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Get onboarding tasks error:", error);
    return res.status(500).json({ message: "Unable to fetch onboarding tasks" });
  }
};

const getMyTasks = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.* FROM users u JOIN onboarding_tasks t ON t.employee_id = u.employee_id
       WHERE u.id = $1 ORDER BY t.due_date NULLS LAST, t.id`,
      [req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Get employee onboarding tasks error:", error);
    return res.status(500).json({ message: "Unable to fetch your onboarding tasks" });
  }
};

const createTask = async (req, res) => {
  try {
    const { employeeId, title, description, dueDate } = req.body;
    if (!employeeId || !title) return res.status(400).json({ message: "Employee and task title are required" });
    const result = await pool.query(
      `INSERT INTO onboarding_tasks (organization_id, employee_id, title, description, due_date, created_by_user_id)
       SELECT $1, e.id, $3, $4, $5, $6 FROM employees e
       WHERE e.id = $2 AND e.organization_id = $1 RETURNING *`,
      [req.user.organizationId, employeeId, title.trim(), description || null, dueDate || null, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Employee not found" });
    await notifyEmployee(req.user.organizationId, employeeId, "Onboarding task assigned", title.trim());
    return res.status(201).json({ message: "Onboarding task created", task: result.rows[0] });
  } catch (error) {
    console.error("Create onboarding task error:", error);
    return res.status(500).json({ message: "Unable to create onboarding task" });
  }
};

const updateTask = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["PENDING", "IN_PROGRESS", "COMPLETE"].includes(status)) return res.status(400).json({ message: "Invalid task status" });
    const managerOnly = req.user.role === "MANAGER";
    const employeeOnly = req.user.role === "EMPLOYEE";
    const result = await pool.query(
      `UPDATE onboarding_tasks t SET status = $1,
         completed_at = CASE WHEN $1 = 'COMPLETE' THEN CURRENT_TIMESTAMP ELSE NULL END
       WHERE t.id = $2 AND t.organization_id = $3
         AND ($4 = FALSE OR EXISTS (SELECT 1 FROM employees e JOIN departments d ON d.id = e.department_id WHERE e.id = t.employee_id AND d.manager_user_id = $5))
         AND ($6 = FALSE OR EXISTS (SELECT 1 FROM users u WHERE u.id = $5 AND u.employee_id = t.employee_id))
       RETURNING t.*`,
      [status, req.params.id, req.user.organizationId, managerOnly, req.user.id, employeeOnly]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Task not found in your access scope" });
    return res.json({ message: "Onboarding task updated", task: result.rows[0] });
  } catch (error) {
    console.error("Update onboarding task error:", error);
    return res.status(500).json({ message: "Unable to update onboarding task" });
  }
};

module.exports = { getTasks, getMyTasks, createTask, updateTask };
