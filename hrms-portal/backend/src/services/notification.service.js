const pool = require("../config/db");

const notifyUser = async (organizationId, userId, title, body) => {
  if (!userId) return;
  try {
    await pool.query(
      "INSERT INTO notifications (organization_id, user_id, title, body) VALUES ($1, $2, $3, $4)",
      [organizationId, userId, title, body]
    );
  } catch (error) {
    console.error("Create notification error:", error.message);
  }
};

const notifyEmployee = async (organizationId, employeeId, title, body) => {
  try {
    await pool.query(
      `INSERT INTO notifications (organization_id, user_id, title, body)
       SELECT $1, u.id, $3, $4 FROM users u
       WHERE u.organization_id = $1 AND u.employee_id = $2`,
      [organizationId, employeeId, title, body]
    );
  } catch (error) {
    console.error("Create employee notification error:", error.message);
  }
};

const notifyDepartmentManager = async (organizationId, employeeId, title, body) => {
  try {
    await pool.query(
      `INSERT INTO notifications (organization_id, user_id, title, body)
       SELECT $1, d.manager_user_id, $3, $4
       FROM employees e JOIN departments d ON d.id = e.department_id
       WHERE e.id = $2 AND e.organization_id = $1 AND d.manager_user_id IS NOT NULL`,
      [organizationId, employeeId, title, body]
    );
  } catch (error) {
    console.error("Create manager notification error:", error.message);
  }
};

module.exports = { notifyUser, notifyEmployee, notifyDepartmentManager };
