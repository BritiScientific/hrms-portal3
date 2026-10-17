const pool = require("../config/db");

const getDesignations = async (req, res) => {
  try {
    const result = await pool.query("SELECT id, title FROM designations WHERE organization_id = $1 ORDER BY title", [req.user.organizationId]);
    return res.json(result.rows);
  } catch (error) {
    console.error("Get designations error:", error);
    return res.status(500).json({ message: "Unable to fetch designations" });
  }
};

const createDesignation = async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ message: "Designation title is required" });
    const result = await pool.query("INSERT INTO designations (organization_id, title) VALUES ($1, $2) RETURNING id, title", [req.user.organizationId, title.trim()]);
    return res.status(201).json({ message: "Designation created", designation: result.rows[0] });
  } catch (error) {
    console.error("Create designation error:", error);
    if (error.code === "23505") return res.status(409).json({ message: "Designation already exists" });
    return res.status(500).json({ message: "Unable to create designation" });
  }
};

const deleteDesignation = async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM designations WHERE id = $1 AND organization_id = $2 RETURNING id", [req.params.id, req.user.organizationId]);
    if (!result.rows.length) return res.status(404).json({ message: "Designation not found" });
    return res.json({ message: "Designation deleted" });
  } catch (error) {
    console.error("Delete designation error:", error);
    return res.status(409).json({ message: "Designation is assigned to an employee and cannot be deleted" });
  }
};

module.exports = { getDesignations, createDesignation, deleteDesignation };
