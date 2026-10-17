const crypto = require("crypto");
const pool = require("../config/db");

const getAttendance = async (req, res) => {
  try {
    const date =
      req.query.date ||
      new Date().toISOString().slice(0, 10);

    const result = await pool.query(
      `SELECT
          a.*,
          e.employee_code,
          CONCAT(
            e.first_name,
            ' ',
            COALESCE(e.last_name, '')
          ) AS employee_name,
          d.name AS department_name
       FROM attendance_daily a
       INNER JOIN employees e
         ON e.id = a.employee_id
       LEFT JOIN departments d
         ON d.id = e.department_id
       WHERE a.organization_id = $1
         AND a.attendance_date = $2
         AND ($3 <> 'MANAGER' OR d.manager_user_id = $4)
       ORDER BY employee_name`,
      [
        req.user.organizationId,
        date,
        req.user.role,
        req.user.id
      ]
    );

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch attendance"
    });
  }
};

const getMyAttendance = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*
       FROM users u
       JOIN attendance_daily a ON a.employee_id = u.employee_id
       WHERE u.id = $1 AND a.organization_id = $2
       ORDER BY a.attendance_date DESC
       LIMIT 90`,
      [req.user.id, req.user.organizationId]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Get own attendance error:", error);
    return res.status(500).json({ message: "Unable to fetch your attendance" });
  }
};

const saveBiometricLog = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      deviceId,
      deviceUserId,
      punchTime,
      punchType,
      verificationType,
      rawPayload
    } = req.body;

    if (!deviceId || !deviceUserId || !punchTime || Number.isNaN(Date.parse(punchTime))) {
      return res.status(400).json({
        message: "Device ID, device user ID, and a valid punch time are required"
      });
    }

    const sourceHash = crypto
      .createHash("sha256")
      .update(
        `${deviceId}-${deviceUserId}-${punchTime}-${punchType}`
      )
      .digest("hex");

    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO attendance_raw_logs (
          organization_id,
          device_id,
          device_user_id,
          punch_time,
          punch_type,
          verification_type,
          source_hash,
          raw_payload
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (device_id, source_hash)
       DO NOTHING
       RETURNING id`,
      [
        req.user.organizationId,
        deviceId,
        deviceUserId,
        punchTime,
        punchType || "UNKNOWN",
        verificationType || null,
        sourceHash,
        rawPayload || null
      ]
    );

    if (!result.rows.length) {
      await client.query("COMMIT");
      return res.status(200).json({
        message: "Duplicate biometric log ignored"
      });
    }

    const employeeResult = await client.query(
      `SELECT id
       FROM employees
       WHERE organization_id = $1
         AND biometric_user_id = $2
       LIMIT 1`,
      [req.user.organizationId, String(deviceUserId)]
    );

    let attendanceUpdated = false;
    if (employeeResult.rows.length && ["IN", "OUT"].includes(punchType)) {
      const employeeId = employeeResult.rows[0].id;
      if (punchType === "IN") {
        await client.query(
          `INSERT INTO attendance_daily (
              organization_id, employee_id, attendance_date,
              status, check_in
           ) VALUES ($1, $2, $3::timestamptz::date, 'PRESENT', $3)
           ON CONFLICT (employee_id, attendance_date)
           DO UPDATE SET
             check_in = LEAST(
               COALESCE(attendance_daily.check_in, EXCLUDED.check_in),
               EXCLUDED.check_in
             ),
             status = 'PRESENT'`,
          [req.user.organizationId, employeeId, punchTime]
        );
      } else {
        await client.query(
          `INSERT INTO attendance_daily (
              organization_id, employee_id, attendance_date,
              status, check_out
           ) VALUES ($1, $2, $3::timestamptz::date, 'PRESENT', $3)
           ON CONFLICT (employee_id, attendance_date)
           DO UPDATE SET
             check_out = GREATEST(
               COALESCE(attendance_daily.check_out, EXCLUDED.check_out),
               EXCLUDED.check_out
             ),
             status = 'PRESENT'`,
          [req.user.organizationId, employeeId, punchTime]
        );
      }
      attendanceUpdated = true;
    }

    await client.query("COMMIT");
    return res.status(201).json({
      message: attendanceUpdated
        ? "Biometric log saved and attendance updated"
        : "Biometric log saved; no matching employee or supported punch type was found"
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(error);

    return res.status(500).json({
      message: "Unable to save biometric log"
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getAttendance,
  getMyAttendance,
  saveBiometricLog
};
