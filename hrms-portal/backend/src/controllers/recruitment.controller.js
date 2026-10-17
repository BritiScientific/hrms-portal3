const pool = require("../config/db");
const { checkSubscriptionCapacity } = require("../services/subscription.service");

const getManpowerRequests = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
          m.*,
          d.name AS department_name,
          u.full_name AS requested_by_name
       FROM manpower_requests m
       INNER JOIN departments d
         ON d.id = m.department_id
       INNER JOIN users u
         ON u.id = m.requested_by_user_id
       WHERE m.organization_id = $1
         AND ($2 <> 'MANAGER' OR d.manager_user_id = $3)
       ORDER BY m.id DESC`,
      [req.user.organizationId, req.user.role, req.user.id]
    );

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch manpower requests"
    });
  }
};

const createManpowerRequest = async (req, res) => {
  try {
    const {
      departmentId,
      designation,
      numberOfPositions,
      experienceRequired,
      skillsRequired,
      reason
    } = req.body;

    if (!departmentId || !designation) {
      return res.status(400).json({ message: "Department and role requested are required" });
    }
    if (req.user.role === "MANAGER") {
      const department = await pool.query(
        "SELECT id FROM departments WHERE id = $1 AND organization_id = $2 AND manager_user_id = $3",
        [departmentId, req.user.organizationId, req.user.id]
      );
      if (!department.rows.length) return res.status(403).json({ message: "You can request hiring only for your assigned department" });
    }

    const result = await pool.query(
      `INSERT INTO manpower_requests (
          organization_id,
          department_id,
          requested_by_user_id,
          designation,
          number_of_positions,
          experience_required,
          skills_required,
          reason,
          status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SUBMITTED')
       RETURNING *`,
      [
        req.user.organizationId,
        departmentId,
        req.user.id,
        designation,
        numberOfPositions || 1,
        experienceRequired || null,
        skillsRequired || null,
        reason
      ]
    );

    return res.status(201).json({
      message: "Manpower request submitted",
      request: result.rows[0]
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Unable to create manpower request"
    });
  }
};

const getJobs = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
          j.*,
          d.name AS department_name
       FROM job_openings j
       INNER JOIN departments d
         ON d.id = j.department_id
       WHERE j.organization_id = $1
         AND ($2 <> 'MANAGER' OR d.manager_user_id = $3)
       ORDER BY j.id DESC`,
      [req.user.organizationId, req.user.role, req.user.id]
    );

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch jobs"
    });
  }
};

const createJob = async (req, res) => {
  try {
    const {
      departmentId,
      jobTitle,
      jobCode,
      jobDescription,
      requiredSkills,
      location,
      numberOfPositions
    } = req.body;

    const result = await pool.query(
      `INSERT INTO job_openings (
          organization_id,
          department_id,
          job_title,
          job_code,
          job_description,
          required_skills,
          location,
          number_of_positions,
          status,
          posted_date,
          created_by_user_id
       )
       VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, 'OPEN',
          CURRENT_DATE, $9
       )
       RETURNING *`,
      [
        req.user.organizationId,
        departmentId,
        jobTitle,
        jobCode,
        jobDescription || null,
        requiredSkills || null,
        location || null,
        numberOfPositions || 1,
        req.user.id
      ]
    );

    return res.status(201).json({
      message: "Job opening created",
      job: result.rows[0]
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Unable to create job"
    });
  }
};

const getCandidates = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
          c.*,
          j.job_title
       FROM candidates c
       LEFT JOIN job_openings j
         ON j.id = c.job_opening_id
       LEFT JOIN departments d ON d.id = j.department_id
       WHERE c.organization_id = $1
         AND ($2 <> 'MANAGER' OR d.manager_user_id = $3)
       ORDER BY c.id DESC`,
      [req.user.organizationId, req.user.role, req.user.id]
    );

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch candidates"
    });
  }
};

const createCandidate = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      jobOpeningId,
      fullName,
      email,
      phone,
      experienceYears,
      source
    } = req.body;

    if (!fullName?.trim()) return res.status(400).json({ message: "Candidate name is required" });
    await client.query("BEGIN");
    await client.query("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", [req.user.organizationId]);
    const capacity = await checkSubscriptionCapacity(client, req.user.organizationId, "candidates");
    if (!capacity.allowed) {
      await client.query("ROLLBACK");
      return res.status(capacity.status).json({ message: capacity.message });
    }

    const result = await client.query(
      `INSERT INTO candidates (
          organization_id,
          job_opening_id,
          full_name,
          email,
          phone,
          experience_years,
          source
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.user.organizationId,
        jobOpeningId || null,
        fullName,
        email || null,
        phone || null,
        experienceYears || 0,
        source || null
      ]
    );
    await client.query("COMMIT");

    return res.status(201).json({
      message: "Candidate created",
      candidate: result.rows[0]
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return res.status(500).json({
      message: "Unable to create candidate"
    });
  } finally {
    client.release();
  }
};

const updateCandidateStage = async (req, res) => {
  try {
    const {
      stage,
      rejectionReason
    } = req.body;

    const result = await pool.query(
      `UPDATE candidates
       SET
          stage = $1,
          rejection_reason = $2
       WHERE id = $3
         AND organization_id = $4
         AND ($5 <> 'MANAGER' OR EXISTS (
           SELECT 1 FROM job_openings j
           JOIN departments d ON d.id = j.department_id
           WHERE j.id = candidates.job_opening_id
             AND d.manager_user_id = $6
         ))
       RETURNING *`,
      [
        stage,
        rejectionReason || null,
        req.params.id,
        req.user.organizationId,
        req.user.role,
        req.user.id
      ]
    );

    return res.json({
      message: "Candidate stage updated",
      candidate: result.rows[0]
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update candidate"
    });
  }
};

module.exports = {
  getManpowerRequests,
  createManpowerRequest,
  getJobs,
  createJob,
  getCandidates,
  createCandidate,
  updateCandidateStage
};
