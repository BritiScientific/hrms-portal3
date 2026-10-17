const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const { getEmailValidationError, getPasswordValidationError } = require("../utils/validation");
const { checkSubscriptionCapacity } = require("../services/subscription.service");

const getUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.status,
              u.employee_id, e.employee_code,
              d.name AS department_name
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.organization_id = $1
       ORDER BY u.full_name`,
      [req.user.organizationId]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Get organization users error:", error);
    return res.status(500).json({ message: "Unable to fetch users" });
  }
};

const createUser = async (req, res) => {
  const client = await pool.connect();
  try {
    const { fullName, email, password, role, departmentId, employeeId } = req.body;
    const allowedRoles = ["HR", "MANAGER", "EMPLOYEE", "RECRUITER"];
    if (!fullName || !email || !password || !allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Name, email, password, and a supported organization role are required" });
    }
    const emailError = getEmailValidationError(email);
    const passwordError = getPasswordValidationError(password);
    if (emailError || passwordError) return res.status(400).json({ message: emailError || passwordError });
    if (role === "MANAGER" && !departmentId) {
      return res.status(400).json({ message: "Select a department for the manager" });
    }
    if (role === "EMPLOYEE" && !employeeId) {
      return res.status(400).json({ message: "Link the employee account to an employee record" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await client.query("BEGIN");
    await client.query("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", [req.user.organizationId]);
    const capacity = await checkSubscriptionCapacity(client, req.user.organizationId, "users");
    if (!capacity.allowed) {
      await client.query("ROLLBACK");
      return res.status(capacity.status).json({ message: capacity.message });
    }

    if (departmentId) {
      const department = await client.query(
        "SELECT id FROM departments WHERE id = $1 AND organization_id = $2",
        [departmentId, req.user.organizationId]
      );
      if (!department.rows.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Department does not belong to this organization" });
      }
    }
    if (employeeId) {
      const employee = await client.query(
        `SELECT e.id FROM employees e
         LEFT JOIN users u ON u.employee_id = e.id
         WHERE e.id = $1 AND e.organization_id = $2 AND u.id IS NULL`,
        [employeeId, req.user.organizationId]
      );
      if (!employee.rows.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Employee record was not found or already has a login" });
      }
    }

    const result = await client.query(
      `INSERT INTO users (organization_id, full_name, email, password, role, department_id, employee_id)
       VALUES ($1, $2, LOWER($3), $4, $5, $6, $7)
       RETURNING id, full_name, email, role, department_id, employee_id`,
      [req.user.organizationId, fullName.trim(), email.trim().toLowerCase(), hashedPassword, role, departmentId || null, employeeId || null]
    );
    if (role === "MANAGER") {
      await client.query(
        "UPDATE departments SET manager_user_id = $1 WHERE id = $2 AND organization_id = $3",
        [result.rows[0].id, departmentId, req.user.organizationId]
      );
    }
    await client.query("COMMIT");
    return res.status(201).json({ message: "User account created", user: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Create organization user error:", error);
    if (error.code === "23505") return res.status(409).json({ message: "Email is already registered" });
    return res.status(500).json({ message: "Unable to create user account" });
  } finally {
    client.release();
  }
};

module.exports = { getUsers, createUser };
