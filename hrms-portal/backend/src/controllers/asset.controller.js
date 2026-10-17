const pool = require("../config/db");
const { notifyEmployee } = require("../services/notification.service");

const getAssets = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, e.employee_code,
              CONCAT(e.first_name, ' ', COALESCE(e.last_name, '')) AS assigned_to
       FROM asset_items a
       LEFT JOIN asset_assignments aa ON aa.asset_id = a.id AND aa.returned_at IS NULL
       LEFT JOIN employees e ON e.id = aa.employee_id
       WHERE a.organization_id = $1 ORDER BY a.id DESC`,
      [req.user.organizationId]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Get assets error:", error);
    return res.status(500).json({ message: "Unable to fetch assets" });
  }
};

const getMyAssets = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.asset_tag, a.name, a.category, a.serial_number, aa.issued_at, aa.notes
       FROM users u JOIN asset_assignments aa ON aa.employee_id = u.employee_id AND aa.returned_at IS NULL
       JOIN asset_items a ON a.id = aa.asset_id WHERE u.id = $1 AND aa.organization_id = $2
       ORDER BY aa.issued_at DESC`,
      [req.user.id, req.user.organizationId]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Get employee assets error:", error);
    return res.status(500).json({ message: "Unable to fetch your assets" });
  }
};

const createAsset = async (req, res) => {
  try {
    const { assetTag, name, category, serialNumber } = req.body;
    if (!assetTag || !name) return res.status(400).json({ message: "Asset tag and name are required" });
    const result = await pool.query(
      `INSERT INTO asset_items (organization_id, asset_tag, name, category, serial_number)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.organizationId, assetTag.trim(), name.trim(), category || null, serialNumber || null]
    );
    return res.status(201).json({ message: "Asset added", asset: result.rows[0] });
  } catch (error) {
    console.error("Create asset error:", error);
    if (error.code === "23505") return res.status(409).json({ message: "Asset tag already exists" });
    return res.status(500).json({ message: "Unable to add asset" });
  }
};

const assignAsset = async (req, res) => {
  const client = await pool.connect();
  try {
    const { employeeId, notes } = req.body;
    await client.query("BEGIN");
    const asset = await client.query(
      `UPDATE asset_items SET status = 'ASSIGNED'
       WHERE id = $1 AND organization_id = $2 AND status = 'AVAILABLE' RETURNING id`,
      [req.params.id, req.user.organizationId]
    );
    if (!asset.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Asset is not available" });
    }
    const assignment = await client.query(
      `INSERT INTO asset_assignments (organization_id, asset_id, employee_id, notes)
       SELECT $1, $2, e.id, $4 FROM employees e WHERE e.id = $3 AND e.organization_id = $1 RETURNING *`,
      [req.user.organizationId, req.params.id, employeeId, notes || null]
    );
    if (!assignment.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Employee not found" });
    }
    await client.query("COMMIT");
    await notifyEmployee(req.user.organizationId, employeeId, "Company asset assigned", "A company asset has been assigned to your employee account.");
    return res.status(201).json({ message: "Asset assigned", assignment: assignment.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Assign asset error:", error);
    return res.status(500).json({ message: "Unable to assign asset" });
  } finally { client.release(); }
};

const returnAsset = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const assignment = await client.query(
      `UPDATE asset_assignments SET returned_at = CURRENT_TIMESTAMP
       WHERE asset_id = $1 AND organization_id = $2 AND returned_at IS NULL RETURNING id`,
      [req.params.id, req.user.organizationId]
    );
    if (!assignment.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Active assignment not found" });
    }
    await client.query("UPDATE asset_items SET status = 'AVAILABLE' WHERE id = $1 AND organization_id = $2", [req.params.id, req.user.organizationId]);
    await client.query("COMMIT");
    return res.json({ message: "Asset returned" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Return asset error:", error);
    return res.status(500).json({ message: "Unable to return asset" });
  } finally { client.release(); }
};

module.exports = { getAssets, getMyAssets, createAsset, assignAsset, returnAsset };
