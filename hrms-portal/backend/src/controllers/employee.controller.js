const pool = require("../config/db");
const ExcelJS = require("exceljs");
const { Readable } = require("stream");
const { getEmailValidationError } = require("../utils/validation");
const {
  getActiveSubscription,
  getUsage,
  checkSubscriptionCapacity
} = require("../services/subscription.service");

const MAX_IMPORT_ROWS = 5000;
const IMPORT_HEADERS = {
  employeecode: "employeeCode",
  code: "employeeCode",
  firstname: "firstName",
  lastname: "lastName",
  officialemail: "officialEmail",
  email: "officialEmail",
  phone: "phone",
  joiningdate: "joiningDate",
  department: "department",
  designation: "designation",
  biometricuserid: "biometricUserId",
  biometricid: "biometricUserId"
};

const normalizeHeader = value => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]/g, "");

const cellValue = value => {
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text).join("");
    if (Object.prototype.hasOwnProperty.call(value, "result")) return value.result;
    if (Object.prototype.hasOwnProperty.call(value, "text")) return value.text;
    return "";
  }
  return value;
};

const normalizeDate = value => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const date = String(value || "").trim();
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? date
    : undefined;
};

const importEmployees = async (req, res) => {
  let client;
  let transactionStarted = false;
  try {
    if (!req.file) return res.status(400).json({ message: "Choose an .xlsx or .csv employee sheet." });

    const workbook = new ExcelJS.Workbook();
    try {
      if (req.file.originalname.toLowerCase().endsWith(".csv")) {
        await workbook.csv.read(Readable.from([req.file.buffer.toString("utf8")]));
      } else {
        await workbook.xlsx.load(req.file.buffer);
      }
    } catch {
      return res.status(400).json({ message: "This file could not be read. Upload a valid .xlsx or .csv file." });
    }
    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      return res.status(400).json({ message: "The sheet must contain a header row and at least one employee row." });
    }
    if (worksheet.rowCount - 1 > MAX_IMPORT_ROWS) {
      return res.status(400).json({ message: `A single import can contain at most ${MAX_IMPORT_ROWS} employee rows.` });
    }

    const columns = new Map();
    worksheet.getRow(1).eachCell((cell, columnNumber) => {
      const key = IMPORT_HEADERS[normalizeHeader(cellValue(cell.value))];
      if (key && !columns.has(key)) columns.set(key, columnNumber);
    });
    const missingHeaders = ["employeeCode", "firstName"].filter(key => !columns.has(key));
    if (missingHeaders.length) {
      return res.status(400).json({
        message: "The sheet is missing required columns: Employee Code and First Name."
      });
    }

    const employees = [];
    const errors = [];
    const seenCodes = new Set();
    const seenBiometricIds = new Set();
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const get = key => columns.has(key) ? cellValue(row.getCell(columns.get(key)).value) : "";
      const values = Object.fromEntries(
        Object.keys(IMPORT_HEADERS)
          .map(key => IMPORT_HEADERS[key])
          .filter((key, index, all) => all.indexOf(key) === index)
          .map(key => [key, get(key)])
      );
      if (Object.values(values).every(value => String(value || "").trim() === "")) continue;

      const employeeCode = String(values.employeeCode || "").trim();
      const firstName = String(values.firstName || "").trim();
      const officialEmail = String(values.officialEmail || "").trim().toLowerCase();
      const biometricUserId = String(values.biometricUserId || "").trim();
      const joiningDate = normalizeDate(values.joiningDate);
      const rowMessages = [];
      if (!employeeCode) rowMessages.push("Employee Code is required.");
      if (!firstName) rowMessages.push("First Name is required.");
      if (officialEmail && getEmailValidationError(officialEmail)) rowMessages.push("Official Email is invalid.");
      if (joiningDate === undefined) rowMessages.push("Joining Date must use YYYY-MM-DD.");
      if (employeeCode && seenCodes.has(employeeCode.toLowerCase())) rowMessages.push("Employee Code appears more than once in this sheet.");
      if (biometricUserId && seenBiometricIds.has(biometricUserId.toLowerCase())) rowMessages.push("Biometric User ID appears more than once in this sheet.");
      if (employeeCode) seenCodes.add(employeeCode.toLowerCase());
      if (biometricUserId) seenBiometricIds.add(biometricUserId.toLowerCase());
      if (rowMessages.length) {
        errors.push({ row: rowNumber, messages: rowMessages });
        continue;
      }
      employees.push({
        rowNumber,
        employeeCode,
        firstName,
        lastName: String(values.lastName || "").trim() || null,
        officialEmail: officialEmail || null,
        phone: String(values.phone || "").trim() || null,
        joiningDate,
        departmentName: String(values.department || "").trim(),
        designationTitle: String(values.designation || "").trim(),
        biometricUserId: biometricUserId || null
      });
    }

    if (!employees.length && !errors.length) {
      return res.status(400).json({ message: "The sheet does not contain any employee data rows." });
    }
    if (errors.length) {
      return res.status(400).json({
        message: "No employees were imported. Correct the listed rows and upload the sheet again.",
        errors: errors.slice(0, 100),
        totalErrors: errors.length
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", [req.user.organizationId]);

    const [departmentResult, designationResult, existingResult] = await Promise.all([
      client.query("SELECT id, name FROM departments WHERE organization_id = $1", [req.user.organizationId]),
      client.query("SELECT id, title FROM designations WHERE organization_id = $1", [req.user.organizationId]),
      client.query(
        `SELECT employee_code, biometric_user_id
         FROM employees
         WHERE organization_id = $1
           AND (employee_code = ANY($2::text[]) OR biometric_user_id = ANY($3::text[]))`,
        [
          req.user.organizationId,
          employees.map(employee => employee.employeeCode),
          employees.map(employee => employee.biometricUserId).filter(Boolean)
        ]
      )
    ]);
    const departments = new Map(departmentResult.rows.map(item => [item.name.trim().toLowerCase(), item.id]));
    const designations = new Map(designationResult.rows.map(item => [item.title.trim().toLowerCase(), item.id]));
    const existingCodes = new Set(existingResult.rows.map(item => item.employee_code));
    const existingBiometricIds = new Map(
      existingResult.rows.filter(item => item.biometric_user_id).map(item => [item.biometric_user_id.toLowerCase(), item.employee_code])
    );

    employees.forEach(employee => {
      if (employee.departmentName && !departments.has(employee.departmentName.toLowerCase())) {
        errors.push({ row: employee.rowNumber, messages: [`Department "${employee.departmentName}" does not exist in this organization.`] });
      }
      if (employee.designationTitle && !designations.has(employee.designationTitle.toLowerCase())) {
        errors.push({ row: employee.rowNumber, messages: [`Designation "${employee.designationTitle}" does not exist in this organization.`] });
      }
      const existingCode = existingBiometricIds.get((employee.biometricUserId || "").toLowerCase());
      if (existingCode && existingCode !== employee.employeeCode) {
        errors.push({ row: employee.rowNumber, messages: [`Biometric User ID is already assigned to employee ${existingCode}.`] });
      }
    });
    if (errors.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        message: "No employees were imported. Correct the listed rows and upload the sheet again.",
        errors: errors.slice(0, 100),
        totalErrors: errors.length
      });
    }

    const newEmployees = employees.filter(employee => !existingCodes.has(employee.employeeCode)).length;
    if (newEmployees) {
      const subscription = await getActiveSubscription(client, req.user.organizationId);
      if (!subscription) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(402).json({ message: "This organization has no active subscription. Ask the Super Admin to assign a plan." });
      }
      const usage = await getUsage(client, req.user.organizationId, subscription.subscription_start_date);
      if (subscription.max_employees !== null && Number(usage.employees) + newEmployees > Number(subscription.max_employees)) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(403).json({
          message: `This import adds ${newEmployees} employees, but the ${subscription.plan_name} plan has room for only ${Math.max(0, Number(subscription.max_employees) - Number(usage.employees))} more.`
        });
      }
    }

    let created = 0;
    let updated = 0;
    for (const employee of employees) {
      await client.query(
        `INSERT INTO employees (
           organization_id, employee_code, first_name, last_name, official_email,
           phone, department_id, designation_id, joining_date, biometric_user_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (organization_id, employee_code) DO UPDATE
         SET first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name,
             official_email = EXCLUDED.official_email,
             phone = EXCLUDED.phone,
             department_id = EXCLUDED.department_id,
             designation_id = EXCLUDED.designation_id,
             joining_date = EXCLUDED.joining_date,
             biometric_user_id = EXCLUDED.biometric_user_id`,
        [
          req.user.organizationId,
          employee.employeeCode,
          employee.firstName,
          employee.lastName,
          employee.officialEmail,
          employee.phone,
          employee.departmentName ? departments.get(employee.departmentName.toLowerCase()) : null,
          employee.designationTitle ? designations.get(employee.designationTitle.toLowerCase()) : null,
          employee.joiningDate,
          employee.biometricUserId
        ]
      );
      if (existingCodes.has(employee.employeeCode)) updated += 1;
      else created += 1;
    }

    await client.query("COMMIT");
    transactionStarted = false;
    return res.json({
      message: "Employee spreadsheet imported successfully.",
      created,
      updated,
      total: created + updated
    });
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
    console.error("Import employees error:", error);
    if (error.code === "23505") {
      return res.status(409).json({ message: "Import stopped because an employee code or biometric ID conflicts with existing data. No changes were saved." });
    }
    if (error.code === "22P02" || error.code === "22007") {
      return res.status(400).json({ message: "The sheet contains a value with an unsupported format. Check the date and employee code columns." });
    }
    return res.status(500).json({ message: "Unable to import employee spreadsheet." });
  } finally {
    if (client) client.release();
  }
};

const getEmployees = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
          e.id,
          e.employee_code,
          e.first_name,
          e.last_name,
          CONCAT(
            e.first_name,
            ' ',
            COALESCE(e.last_name, '')
          ) AS full_name,
          e.official_email,
          e.phone,
          e.joining_date,
          e.employment_status,
          e.biometric_user_id,
          EXISTS (SELECT 1 FROM users eu WHERE eu.employee_id = e.id) AS has_login,
          d.name AS department_name,
          ds.title AS designation_name
       FROM employees e
       LEFT JOIN departments d
         ON d.id = e.department_id
       LEFT JOIN designations ds
         ON ds.id = e.designation_id
       WHERE e.organization_id = $1
         AND ($2 <> 'MANAGER' OR d.manager_user_id = $3)
       ORDER BY e.id DESC`,
      [req.user.organizationId, req.user.role, req.user.id]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Unable to fetch employees"
    });
  }
};

const getMyEmployee = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.employee_code, e.first_name, e.last_name,
              CONCAT(e.first_name, ' ', COALESCE(e.last_name, '')) AS full_name,
              e.official_email, e.phone, e.joining_date, e.employment_status,
              e.biometric_user_id, d.name AS department_name, ds.title AS designation_name
       FROM users u
       JOIN employees e ON e.id = u.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN designations ds ON ds.id = e.designation_id
       WHERE u.id = $1 AND e.organization_id = $2`,
      [req.user.id, req.user.organizationId]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Employee profile is not linked to this account" });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Get own employee profile error:", error);
    return res.status(500).json({ message: "Unable to load employee profile" });
  }
};

const createEmployee = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      employeeCode,
      firstName,
      lastName,
      officialEmail,
      phone,
      departmentId,
      designationId,
      joiningDate,
      biometricUserId
    } = req.body;

    if (!employeeCode || !firstName) {
      return res.status(400).json({
        message: "Employee code and first name are required"
      });
    }
    if (officialEmail) {
      const emailError = getEmailValidationError(officialEmail);
      if (emailError) return res.status(400).json({ message: emailError });
    }

    await client.query("BEGIN");
    await client.query("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", [req.user.organizationId]);
    const capacity = await checkSubscriptionCapacity(client, req.user.organizationId, "employees");
    if (!capacity.allowed) {
      await client.query("ROLLBACK");
      return res.status(capacity.status).json({ message: capacity.message });
    }

    const result = await client.query(
      `INSERT INTO employees (
          organization_id,
          employee_code,
          first_name,
          last_name,
          official_email,
          phone,
          department_id,
          designation_id,
          joining_date,
          biometric_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        req.user.organizationId,
        employeeCode,
        firstName,
        lastName || null,
        officialEmail ? officialEmail.trim().toLowerCase() : null,
        phone || null,
        departmentId || null,
        designationId || null,
        joiningDate || null,
        biometricUserId || null
      ]
    );
    await client.query("COMMIT");

    return res.status(201).json({
      message: "Employee created successfully",
      employee: result.rows[0]
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(error);

    if (error.code === "23505") {
      return res.status(409).json({
        message: "Employee code or biometric ID already exists"
      });
    }

    return res.status(500).json({
      message: "Unable to create employee"
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getEmployees,
  createEmployee,
  getMyEmployee,
  importEmployees
};
