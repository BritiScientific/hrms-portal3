const pool = require("../config/db");
const { checkSubscriptionCapacity } = require("../services/subscription.service");

const getDepartments = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
          d.id,
          d.name,
          d.code,
          d.description,
          d.status,
          u.full_name AS manager_name
       FROM departments d
       LEFT JOIN users u
         ON u.id = d.manager_user_id
       WHERE d.organization_id = $1
         AND ($2 <> 'MANAGER' OR d.manager_user_id = $3)
       ORDER BY d.name`,
      [req.user.organizationId, req.user.role, req.user.id]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Unable to fetch departments"
    });
  }
};

const createDepartment = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      name,
      code,
      description
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: "Department name is required" });
    await client.query("BEGIN");
    await client.query("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", [req.user.organizationId]);
    const capacity = await checkSubscriptionCapacity(client, req.user.organizationId, "departments");
    if (!capacity.allowed) {
      await client.query("ROLLBACK");
      return res.status(capacity.status).json({ message: capacity.message });
    }

    const result = await client.query(
      `INSERT INTO departments (
          organization_id,
          name,
          code,
          description
       )
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        req.user.organizationId,
        name,
        code || null,
        description || null
      ]
    );
    await client.query("COMMIT");

    return res.status(201).json({
      message: "Department created successfully",
      department: result.rows[0]
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(error);

    return res.status(500).json({
      message: "Unable to create department"
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getDepartments,
  createDepartment
};

const deleteDepartment = async (
  req,
  res
) => {
  try {
    const result = await pool.query(
      `DELETE FROM departments
       WHERE id = $1
         AND organization_id = $2
       RETURNING id, name`,
      [
        req.params.id,
        req.user.organizationId
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        message: "Department not found"
      });
    }

    return res.json({
      message: "Department deleted successfully",
      department: result.rows[0]
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message:
        "Unable to delete department. It may be used by employees."
    });
  }
};
module.exports = {
  getDepartments,
  createDepartment,
  deleteDepartment
};
