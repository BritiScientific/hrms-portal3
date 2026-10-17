const pool = require("../config/db");
const { notifyUser } = require("../services/notification.service");

const getInterviews = async (req, res) => {
  try {
    const managerOnly = req.user.role === "MANAGER";
    const result = await pool.query(
      `SELECT i.*, c.full_name AS candidate_name, j.job_title, d.name AS department_name
       FROM interviews i JOIN candidates c ON c.id = i.candidate_id
       LEFT JOIN job_openings j ON j.id = i.job_opening_id
       LEFT JOIN departments d ON d.id = j.department_id
       WHERE i.organization_id = $1 AND ($2 = FALSE OR d.manager_user_id = $3)
       ORDER BY i.scheduled_at`,
      [req.user.organizationId, managerOnly, req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Get interviews error:", error);
    return res.status(500).json({ message: "Unable to fetch interviews" });
  }
};

const createInterview = async (req, res) => {
  try {
    const { candidateId, scheduledAt, interviewType, locationOrLink, interviewerUserId } = req.body;
    if (!candidateId || !scheduledAt || Number.isNaN(Date.parse(scheduledAt))) return res.status(400).json({ message: "Candidate and a valid interview date are required" });
    if (interviewerUserId) {
      const interviewer = await pool.query(
        "SELECT id FROM users WHERE id = $1 AND organization_id = $2",
        [interviewerUserId, req.user.organizationId]
      );
      if (!interviewer.rows.length) return res.status(400).json({ message: "Interviewer must be a user in this organization" });
    }
    const managerOnly = req.user.role === "MANAGER";
    const result = await pool.query(
      `INSERT INTO interviews (organization_id, candidate_id, job_opening_id, interviewer_user_id, scheduled_at, interview_type, location_or_link, created_by_user_id)
       SELECT $1, c.id, c.job_opening_id, $5, $3, $6, $7, $8
       FROM candidates c LEFT JOIN job_openings j ON j.id = c.job_opening_id
       LEFT JOIN departments d ON d.id = j.department_id
       WHERE c.id = $2 AND c.organization_id = $1 AND ($4 = FALSE OR d.manager_user_id = $8)
       RETURNING *`,
      [req.user.organizationId, candidateId, scheduledAt, managerOnly, interviewerUserId || null, interviewType || "VIDEO", locationOrLink || null, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Candidate not found in your organization or department" });
    await notifyUser(req.user.organizationId, interviewerUserId, "Interview scheduled", `An interview was scheduled for ${new Date(scheduledAt).toLocaleString()}.`);
    return res.status(201).json({ message: "Interview scheduled", interview: result.rows[0] });
  } catch (error) {
    console.error("Schedule interview error:", error);
    return res.status(500).json({ message: "Unable to schedule interview" });
  }
};

const updateInterview = async (req, res) => {
  try {
    const { status, feedback } = req.body;
    if (!["SCHEDULED", "COMPLETED", "CANCELLED"].includes(status)) return res.status(400).json({ message: "Invalid interview status" });
    const managerOnly = req.user.role === "MANAGER";
    const result = await pool.query(
      `UPDATE interviews i SET status = $1, feedback = $2
       WHERE i.id = $3 AND i.organization_id = $4
         AND ($5 = FALSE OR EXISTS (
           SELECT 1 FROM job_openings j JOIN departments d ON d.id = j.department_id
           WHERE j.id = i.job_opening_id AND d.manager_user_id = $6
         )) RETURNING i.*`,
      [status, feedback || null, req.params.id, req.user.organizationId, managerOnly, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Interview not found in your access scope" });
    return res.json({ message: "Interview updated", interview: result.rows[0] });
  } catch (error) {
    console.error("Update interview error:", error);
    return res.status(500).json({ message: "Unable to update interview" });
  }
};

module.exports = { getInterviews, createInterview, updateInterview };
