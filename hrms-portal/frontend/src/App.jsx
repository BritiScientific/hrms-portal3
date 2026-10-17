import { useEffect, useState } from "react";

import api from "./api/api";
import { getEmailValidationError, getPasswordValidationError } from "./utils/validation";

import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate
} from "react-router-dom";

const Login = ({ onLogin }) => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [setupAvailable, setSetupAvailable] = useState(false);
  const [fullName, setFullName] = useState("");
  const [bootstrapKey, setBootstrapKey] = useState("");
  const [portalRole, setPortalRole] = useState("ANY");

  useEffect(() => {
    api.get("/auth/setup-status").then(response => setSetupAvailable(response.data.setupAvailable === true)).catch(() => setSetupAvailable(false));
  }, []);

  const submit = async (event) => {
    event.preventDefault();

    const emailError = getEmailValidationError(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    if (settingUp) {
      const passwordError = getPasswordValidationError(password);
      if (passwordError) {
        setError(passwordError);
        return;
      }
      if (!fullName.trim()) {
        setError("Enter the administrator's full name.");
        return;
      }
      if (!bootstrapKey) {
        setError("Enter the one-time Super Admin setup key from the server administrator.");
        return;
      }
    }

    try {
      setLoading(true);
      setError("");
      if (settingUp) {
        await api.post("/auth/setup-first-user", { fullName: fullName.trim(), email: email.trim(), password, bootstrapKey });
        setSetupAvailable(false);
      }
      const response = await api.post("/auth/login", { email: email.trim(), password });
      if (portalRole !== "ANY" && response.data.user.role !== portalRole) {
        setError(`This account uses the ${response.data.user.role.replaceAll("_", " ")} portal. Choose that portal and try again.`);
        return;
      }
      onLogin(response.data);
      navigate("/dashboard");
    } catch (requestError) {
      const apiUnavailableMessage = import.meta.env.PROD
        ? "Cannot reach the HRMS API. Deploy the backend separately, set VITE_API_BASE_URL in Netlify to its HTTPS URL ending in /api/v1, and redeploy the frontend."
        : "Cannot reach the HRMS API. Start the backend with `cd backend` and `npm.cmd start`, then refresh this page.";
      setError(requestError.response?.data?.message || apiUnavailableMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-hero">
        <img className="brand-logo-image login-brand-logo" src="/whatsoft-logo.png" alt="Whatsoft" />

        <p className="eyebrow">
           HR MANAGEMENT PLATFORM
        </p>

        <h1>
          Manage your people,
          <br />
          hiring and growth.
        </h1>

        <p>
          One connected workspace for employees,
          managers, HR teams and recruiters.
        </p>

        <div className="feature-pills">
          <span>Employee Management</span>
          <span>ATS Recruitment</span>
          <span>Biometric Attendance</span>
          <span>WhatsApp HR Help</span>
        </div>
      </section>

      <form
        className="login-card"
        onSubmit={submit}
      >
        <h2>{settingUp ? "Create the first admin" : "Welcome back"}</h2>
        <p>{settingUp ? "Set up your HRMS administrator account." : "Login to your HRMS portal."}</p>

        {error && (
          <div className="error-box">
            {error}
          </div>
        )}

        <label>
          Choose your portal
          <select value={settingUp ? "SUPER_ADMIN" : portalRole} disabled={settingUp} onChange={event => setPortalRole(event.target.value)}>
            <option value="ANY">Automatic (use my account role)</option>
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="ORG_ADMIN">Organization Admin</option>
            <option value="HR">HR</option>
            <option value="MANAGER">Department Manager</option>
            <option value="EMPLOYEE">Employee</option>
            <option value="RECRUITER">Recruiter</option>
          </select>
        </label>

        {settingUp && <label>Full name<input value={fullName} onChange={event => setFullName(event.target.value)} required /></label>}
        {settingUp && <label>One-time setup key<input type="password" autoComplete="off" value={bootstrapKey} onChange={event => setBootstrapKey(event.target.value)} required /><small className="field-hint">A deployment administrator must set SUPER_ADMIN_BOOTSTRAP_KEY on the backend. Use at least 32 random characters.</small></label>}

        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            autoComplete={settingUp ? "new-password" : "current-password"}
            minLength={settingUp ? 8 : undefined}
            title={settingUp ? "Use 8+ characters with uppercase, lowercase, a number, and a special character." : undefined}
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            required
          />
          {settingUp && <small className="field-hint">Use 8+ characters with uppercase, lowercase, a number, and a special character.</small>}
        </label>

        <button
          className="primary-button full-width"
          type="submit"
        >
          {loading ? "Please wait..." : settingUp ? "Create administrator" : "Login"}
        </button>
        {settingUp ? <button className="secondary-button full-width" type="button" onClick={() => { setSettingUp(false); setPortalRole("ANY"); setError(""); }}>
          I already have an account
        </button> : setupAvailable && <button className="secondary-button full-width" type="button" onClick={() => { setSettingUp(true); setPortalRole("SUPER_ADMIN"); setError(""); }}>
          Initial Super Admin setup
        </button>}
      </form>
    </main>
  );
};

const AcceptOrganizationInvite = () => {
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [invitation, setInvitation] = useState(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const inviteToken = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    setToken(inviteToken);
    if (!inviteToken) {
      setError("This invitation link is incomplete. Ask the Super Admin to send a new link.");
      setLoading(false);
      return;
    }
    api.post("/auth/organization-admin-invitations/preview", { token: inviteToken })
      .then(response => setInvitation(response.data))
      .catch(requestError => setError(requestError.response?.data?.message || "This invitation link is invalid or expired."))
      .finally(() => setLoading(false));
  }, []);

  const accept = async event => {
    event.preventDefault();
    const passwordError = getPasswordValidationError(password);
    if (passwordError) return setError(passwordError);
    if (password !== confirmPassword) return setError("The passwords do not match.");
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/organization-admin-invitations/accept", { token, password });
      window.history.replaceState(null, "", window.location.pathname);
      setAccepted(true);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to accept this invitation.");
    } finally {
      setLoading(false);
    }
  };

  return <main className="login-page"><section className="login-hero"><img className="brand-logo-image login-brand-logo" src="/whatsoft-logo.png" alt="Whatsoft" /><p className="eyebrow">HR MANAGEMENT PLATFORM</p><h1>Welcome to your organization.</h1><p>Set up your own secure account to manage your organization's HRMS workspace.</p></section>
    <section className="login-card"><h2>{accepted ? "Account ready" : "Accept admin invitation"}</h2><p>{accepted ? "Your Organization Admin account has been created." : "Create a password for your Organization Admin account."}</p>
      {error && <div className="error-box">{error}</div>}
      {accepted ? <button className="primary-button full-width" onClick={() => navigate("/", { replace: true })}>Go to sign in</button> : loading && !invitation ? <p>Checking invitation…</p> : invitation && <form onSubmit={accept}>
        <div className="white-panel invite-recipient"><strong>{invitation.full_name}</strong><span>{invitation.email}</span><small>{invitation.organization_name} · Link expires {new Date(invitation.expires_at).toLocaleString()}</small></div>
        <label>Password<input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required /><small className="field-hint">Use at least 8 characters with uppercase, lowercase, a number, and a special character.</small></label>
        <label>Confirm password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></label>
        <button className="primary-button full-width" disabled={loading}>{loading ? "Please wait…" : "Create my account"}</button>
      </form>}
    </section>
  </main>;
};

const HrDashboard = ({ user }) => {
  const [counts, setCounts] = useState({ employees: "-", departments: "-", vacancies: "-", approvals: "-" });
  useEffect(() => {
    Promise.allSettled([
      api.get("/employees"),
      api.get("/departments"),
      api.get("/recruitment/jobs"),
      api.get("/recruitment/manpower-requests")
    ]).then(([employees, departments, jobs, requests]) => setCounts({
      employees: employees.status === "fulfilled" ? employees.value.data.length : "-",
      departments: departments.status === "fulfilled" ? departments.value.data.length : "-",
      vacancies: jobs.status === "fulfilled" ? jobs.value.data.filter(job => job.status === "OPEN").length : "-",
      approvals: requests.status === "fulfilled" ? requests.value.data.filter(request => request.status === "SUBMITTED").length : "-"
    }));
  }, []);
  return (
    <div>
      <PageTitle
        breadcrumb={user.role === "ORG_ADMIN" ? "Organization / Administration" : "People / HR operations"}
        title={user.role === "ORG_ADMIN" ? "Organization Admin dashboard" : "HR dashboard"}
        description={user.role === "ORG_ADMIN"
          ? `Manage ${user.organizationName || "your organization"} and its people operations.`
          : `Manage people operations for ${user.organizationName || "your organization"}.`}
      />

      <div className="summary-grid">
        <article className="summary-card blue">
          <span>Active Employees</span>
          <strong>{counts.employees}</strong>
          <small>Employee records</small>
        </article>

        <article className="summary-card purple">
          <span>Departments</span>
          <strong>{counts.departments}</strong>
          <small>Company departments</small>
        </article>

        <article className="summary-card orange">
          <span>Open Vacancies</span>
          <strong>{counts.vacancies}</strong>
          <small>Current job openings</small>
        </article>

        <article className="summary-card green">
          <span>Pending Approvals</span>
          <strong>{counts.approvals}</strong>
          <small>Requests awaiting action</small>
        </article>
      </div>

      <div className="content-columns">
        <article className="white-panel">
          <h3>HRMS lifecycle</h3>

          <div className="workflow">
            <span>Request</span>
            <b>&rarr;</b>
            <span>Approval</span>
            <b>&rarr;</b>
            <span>ATS</span>
            <b>&rarr;</b>
            <span>Hiring</span>
            <b>&rarr;</b>
            <span>Employee</span>
          </div>
        </article>

        <article className="white-panel">
          <h3>Employee support</h3>
          <p>
            Employees can contact HR through the
            WhatsApp button.
          </p>
        </article>
      </div>
    </div>
  );
};

const Dashboard = ({ user }) => {
  if (user.role === "SUPER_ADMIN") return <PlatformDashboard />;
  if (user.role === "MANAGER") return <ManagerDashboard />;
  if (user.role === "EMPLOYEE") return <EmployeeDashboard />;
  if (user.role === "RECRUITER") return <RecruiterDashboard />;
  return <HrDashboard user={user} />;
};

const Employees = ({ canManage = true }) => {
  const [
    employees,
    setEmployees
  ] = useState([]);

  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importResult, setImportResult] = useState(null);

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    showForm,
    setShowForm
  ] = useState(false);

  const [
    form,
    setForm
  ] = useState({
    employeeCode: "",
    firstName: "",
    lastName: "",
    officialEmail: "",
    phone: "",
    joiningDate: "",
    departmentId: "",
    designationId: "",
    biometricUserId: ""
  });

  const loadEmployees = async () => {
    try {
      setLoading(true);

      const response = await api.get(
        "/employees"
      );

      setEmployees(response.data);
    } catch (error) {
      alert(
        error.response?.data?.message ||
        "Unable to load employees"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
    Promise.all([api.get("/departments"), api.get("/designations")]).then(([departmentResult, designationResult]) => {
      setDepartments(departmentResult.data);
      setDesignations(designationResult.data);
    }).catch(() => {});
  }, []);

  const createEmployee = async (
    event
  ) => {
    event.preventDefault();

    if (form.officialEmail) {
      const emailError = getEmailValidationError(form.officialEmail);
      if (emailError) {
        alert(emailError);
        return;
      }
    }

    try {
      await api.post(
        "/employees",
        {
          ...form,
          departmentId:
            form.departmentId ||
            null,
          designationId:
            form.designationId ||
            null
        }
      );

      setForm({
        employeeCode: "",
        firstName: "",
        lastName: "",
        officialEmail: "",
        phone: "",
        joiningDate: "",
        departmentId: "",
        designationId: "",
        biometricUserId: ""
      });

      setShowForm(false);
      loadEmployees();
    } catch (error) {
      alert(
        error.response?.data?.message ||
        "Unable to create employee"
      );
    }
  };

  const downloadEmployeeTemplate = () => {
    const csv = [
      "Employee Code,First Name,Last Name,Official Email,Phone,Joining Date,Department,Designation,Biometric User ID",
      "EMP-001,Alex,Example,alex@example.com,9876543210,2026-01-15,Human Resources,HR Executive,DEVICE-001"
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "employee-import-template.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const exportEmployees = () => {
    const columns = [
      ["Employee Code", "employee_code"],
      ["First Name", "first_name"],
      ["Last Name", "last_name"],
      ["Official Email", "official_email"],
      ["Phone", "phone"],
      ["Joining Date", "joining_date"],
      ["Department", "department_name"],
      ["Designation", "designation_name"],
      ["Employment Status", "employment_status"],
      ["Biometric User ID", "biometric_user_id"]
    ];
    const escapeCell = value => {
      let text = String(value ?? "");
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const rows = [
      columns.map(([label]) => escapeCell(label)).join(","),
      ...employees.map(employee => columns.map(([, field]) => escapeCell(employee[field])).join(","))
    ];
    const blob = new Blob(["\uFEFF", rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const importEmployeeSheet = async () => {
    if (!importFile) return;
    const formData = new FormData();
    formData.append("file", importFile);
    setImportLoading(true);
    setImportError(null);
    setImportResult(null);
    try {
      const response = await api.post("/employees/import", formData);
      setImportResult(response.data);
      setImportFile(null);
      const input = document.getElementById("employee-sheet-upload");
      if (input) input.value = "";
      await loadEmployees();
    } catch (error) {
      setImportError(error.response?.data || { message: "Unable to import this employee sheet." });
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div>
      <div className="page-title">
        <small>
          HR Management / Employees
        </small>

        <h1>Employees</h1>

        <p>
          Employee records and biometric mapping.
        </p>
      </div>

      <div className="toolbar">
        {canManage && <button
          className="primary-button"
          onClick={() =>
            setShowForm(!showForm)
          }
        >
          + Add Employee
        </button>}

        <button
          className="secondary-button"
          onClick={loadEmployees}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
        <button
          className="secondary-button"
          onClick={exportEmployees}
          disabled={loading || !employees.length}
        >
          Export employees (CSV)
        </button>
      </div>

      {canManage && <section className="form-panel employee-import-panel">
        <h3>Import employees from a spreadsheet</h3>
        <p>Upload an .xlsx or .csv file (up to 5 MB and 5,000 rows). Use the template to get the column names right. Existing employee codes are updated; new codes create employee records.</p>
        <p className="field-hint">Employee Code and First Name are required. Dates must use YYYY-MM-DD. Department and Designation must already exist. Blank optional cells clear those values on matching employee records.</p>
        <div className="employee-import-controls">
          <button type="button" className="secondary-button" onClick={downloadEmployeeTemplate}>Download CSV template</button>
          <input id="employee-sheet-upload" type="file" accept=".xlsx,.csv" onChange={event => { setImportFile(event.target.files?.[0] || null); setImportError(null); setImportResult(null); }} />
          <button type="button" className="primary-button" disabled={!importFile || importLoading} onClick={importEmployeeSheet}>{importLoading ? "Importing…" : "Import employees"}</button>
        </div>
        {importError && <div className="error-box employee-import-feedback">
          <strong>{importError.message}</strong>
          {importError.errors?.length > 0 && <ul>{importError.errors.map((item, index) => <li key={`${item.row}-${index}`}>Row {item.row}: {item.messages.join(" ")}</li>)}</ul>}
          {importError.totalErrors > importError.errors?.length && <small>Showing the first {importError.errors.length} of {importError.totalErrors} row errors.</small>}
        </div>}
        {importResult && <div className="success-box employee-import-feedback">{importResult.message} Created: {importResult.created}; updated: {importResult.updated}.</div>}
      </section>}

      {showForm && canManage && (
        <form
          className="form-panel"
          onSubmit={createEmployee}
        >
          <h3>Create Employee</h3>

          <div className="form-grid">
            <label>
              Employee Code
              <input
                value={form.employeeCode}
                onChange={(event) =>
                  setForm({
                    ...form,
                    employeeCode:
                      event.target.value
                  })
                }
                placeholder="EMP-001"
                required
              />
            </label>

            <label>
              First Name
              <input
                value={form.firstName}
                onChange={(event) =>
                  setForm({
                    ...form,
                    firstName:
                      event.target.value
                  })
                }
                required
              />
            </label>

            <label>
              Last Name
              <input
                value={form.lastName}
                onChange={(event) =>
                  setForm({
                    ...form,
                    lastName:
                      event.target.value
                  })
                }
              />
            </label>

            <label>
              Official Email
              <input
                type="email"
                value={form.officialEmail}
                onChange={(event) =>
                  setForm({
                    ...form,
                    officialEmail:
                      event.target.value
                  })
                }
              />
            </label>

            <label>
              Phone
              <input
                value={form.phone}
                onChange={(event) =>
                  setForm({
                    ...form,
                    phone:
                      event.target.value
                  })
                }
              />
            </label>

            <label>
              Joining Date
              <input
                type="date"
                value={form.joiningDate}
                onChange={(event) =>
                  setForm({
                    ...form,
                    joiningDate:
                      event.target.value
                  })
                }
              />
            </label>

            <label>Department<select value={form.departmentId} onChange={event => setForm({ ...form, departmentId: event.target.value })}><option value="">Select department</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>

            <label>Designation<select value={form.designationId} onChange={event => setForm({ ...form, designationId: event.target.value })}><option value="">Select designation</option>{designations.map(designation => <option key={designation.id} value={designation.id}>{designation.title}</option>)}</select></label>

            <label>
              Biometric User ID
              <input
                value={form.biometricUserId}
                onChange={(event) =>
                  setForm({
                    ...form,
                    biometricUserId:
                      event.target.value
                  })
                }
              />
            </label>
          </div>

          <button className="primary-button">
            Save Employee
          </button>
        </form>
      )}

      <div className="white-panel table-panel">
        {loading ? (
          <div className="empty-state">
            Loading employees...
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Department</th>
                <th>Email</th>
                <th>Biometric ID</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td>{employee.full_name}</td>
                  <td>
                    {employee.employee_code}
                  </td>
                  <td>
                    {employee.department_name ||
                      "-"}
                  </td>
                  <td>
                    {employee.official_email ||
                      "-"}
                  </td>
                  <td>
                    {employee.biometric_user_id ||
                      "-"}
                  </td>
                  <td>
                    <span className="status active">
                      {employee.employment_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!loading &&
          !employees.length && (
            <div className="empty-state">
              No employees available.
            </div>
          )}
      </div>
    </div>
  );
};

const Departments = ({ canManage = true }) => {
  const [
    departments,
    setDepartments
  ] = useState([]);

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    showForm,
    setShowForm
  ] = useState(false);

  const [
    form,
    setForm
  ] = useState({
    name: "",
    code: "",
    description: ""
  });

  const loadDepartments = async () => {
    try {
      setLoading(true);

      const response = await api.get(
        "/departments"
      );

      setDepartments(response.data);
    } catch (error) {
      console.error(error);

      alert(
        error.response?.data?.message ||
        "Unable to load departments"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDepartments();
  }, []);

  const createDepartment = async (
    event
  ) => {
    event.preventDefault();

    try {
      await api.post(
        "/departments",
        form
      );

      setForm({
        name: "",
        code: "",
        description: ""
      });

      setShowForm(false);
      loadDepartments();
    } catch (error) {
      alert(
        error.response?.data?.message ||
        "Unable to create department"
      );
    }
  };

  const deleteDepartment = async (
    departmentId,
    departmentName
  ) => {
    const confirmed = window.confirm(
      `Delete ${departmentName}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.delete(
        `/departments/${departmentId}`
      );

      loadDepartments();
    } catch (error) {
      alert(
        error.response?.data?.message ||
        "Unable to delete department"
      );
    }
  };

  return (
    <div>
      <div className="page-title">
        <small>
          Organization / Departments
        </small>

        <h1>Departments</h1>

        <p>
          Manage organization departments.
        </p>
      </div>

      {canManage && <div className="toolbar">
        <button
          className="primary-button"
          onClick={() =>
            setShowForm(!showForm)
          }
        >
          + Add Department
        </button>

        <button
          className="secondary-button"
          onClick={loadDepartments}
        >
          Refresh
        </button>
      </div>}

      {showForm && canManage && (
        <form
          className="form-panel"
          onSubmit={createDepartment}
        >
          <h3>Create Department</h3>

          <div className="form-grid">
            <label>
              Department Name
              <input
                value={form.name}
                onChange={(event) =>
                  setForm({
                    ...form,
                    name: event.target.value
                  })
                }
                required
              />
            </label>

            <label>
              Department Code
              <input
                value={form.code}
                onChange={(event) =>
                  setForm({
                    ...form,
                    code: event.target.value
                  })
                }
              />
            </label>

            <label>
              Description
              <input
                value={form.description}
                onChange={(event) =>
                  setForm({
                    ...form,
                    description:
                      event.target.value
                  })
                }
              />
            </label>
          </div>

          <button className="primary-button">
            Save Department
          </button>
        </form>
      )}

      <div className="white-panel table-panel">
        {loading ? (
          <div className="empty-state">
            Loading departments...
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Description</th>
                <th>Status</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>

            <tbody>
              {departments.map(
                (department) => (
                  <tr key={department.id}>
                    <td>
                      {department.name}
                    </td>

                    <td>
                      {department.code || "-"}
                    </td>

                    <td>
                      {department.description ||
                        "-"}
                    </td>

                    <td>
                      <span className="status active">
                        {department.status}
                      </span>
                    </td>

                    {canManage && <td>
                      <button
                        className="small-button danger"
                        onClick={() =>
                          deleteDepartment(
                            department.id,
                            department.name
                          )
                        }
                      >
                        Delete
                      </button>
                    </td>}
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}

        {!loading &&
          !departments.length && (
            <div className="empty-state">
              No departments available.
            </div>
          )}
      </div>
    </div>
  );
};

const Organizations = () => {
  const [organizations, setOrganizations] = useState([]);
  const [form, setForm] = useState({ name: "", code: "", email: "", phone: "" });
  const [admin, setAdmin] = useState({ organizationId: "", fullName: "", email: "" });
  const [invite, setInvite] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    try { const response = await api.get("/organizations"); setOrganizations(response.data); setError(""); }
    catch (requestError) { setError(requestError.response?.data?.message || "Unable to load organizations."); }
  };
  useEffect(() => { load(); }, []);
  const submit = async event => {
    event.preventDefault();
    try { await api.post("/organizations", form); setForm({ name: "", code: "", email: "", phone: "" }); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || "Unable to create organization."); }
  };
  const createAdmin = async event => {
    event.preventDefault();
    const emailError = getEmailValidationError(admin.email);
    if (emailError) {
      setError(emailError);
      return;
    }
    try {
      const response = await api.post("/organizations/admin", admin);
      setInvite({ url: response.data.inviteUrl, email: admin.email, expiresAt: response.data.expiresAt });
      setAdmin({ organizationId: "", fullName: "", email: "" });
      setError("");
      setCopied(false);
      await load();
    } catch (requestError) { setError(requestError.response?.data?.message || "Unable to create organization admin invitation."); }
  };
  return <div><PageTitle breadcrumb="Platform administration" title="Organizations" description="Create and monitor HRMS customer organizations." />
    <form className="form-panel" onSubmit={submit}><h3>Add organization</h3><div className="form-grid">
      {[["name", "Organization name"], ["code", "Unique code"], ["email", "Contact email"], ["phone", "Phone"]].map(([key, label]) => <label key={key}>{label}<input required={key === "name" || key === "code"} type={key === "email" ? "email" : "text"} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}
    </div><button className="primary-button">Create organization</button></form>
    {error && <div className="error-box">{error}</div>}
    <div className="white-panel table-panel"><h3>Organizations</h3>{organizations.length ? <table><thead><tr><th>Name</th><th>Code</th><th>Status</th><th>Plan</th><th>Plan ends</th><th>Employees</th><th>Users</th></tr></thead><tbody>{organizations.map(org => <tr key={org.id}><td>{org.name}</td><td>{org.code}</td><td>{org.status}</td><td>{org.subscription_plan || "No active plan"}</td><td>{org.subscription_end_date?.slice(0, 10) || (org.subscription_plan ? "Unlimited" : "-")}</td><td>{org.employee_count}</td><td>{org.user_count}</td></tr>)}</tbody></table> : <div className="empty-state">No organizations have been created.</div>}</div>
    <form className="form-panel" onSubmit={createAdmin}><h3>Invite an organization admin</h3><p>Create a one-time link so the admin can set their own password. The link expires in 48 hours; email delivery is not configured, so share it directly with the invited person.</p><div className="form-grid">
      <label>Organization<select required value={admin.organizationId} onChange={event => setAdmin({ ...admin, organizationId: event.target.value })}><option value="">Select organization</option>{organizations.filter(org => org.status === "ACTIVE").map(org => <option value={org.id} key={org.id}>{org.name}</option>)}</select></label>
      <label>Full name<input required value={admin.fullName} onChange={event => setAdmin({ ...admin, fullName: event.target.value })} /></label>
      <label>Email<input required type="email" autoComplete="email" value={admin.email} onChange={event => setAdmin({ ...admin, email: event.target.value })} /></label>
    </div><button className="primary-button">Create invitation link</button></form>
    {invite && <div className="success-box invitation-result"><strong>Invitation link for {invite.email}</strong><span>This link works once and expires {new Date(invite.expiresAt).toLocaleString()}.</span><div className="invitation-link-row"><input aria-label="Organization Admin invitation link" readOnly value={invite.url} /><button type="button" className="secondary-button" onClick={async () => { try { await navigator.clipboard.writeText(invite.url); setCopied(true); } catch { setError("Clipboard access was blocked. Select and copy the invitation link manually."); } }}>{copied ? "Copied" : "Copy link"}</button></div><small>Send it only to the named admin using a trusted channel. Creating a new invitation for the same email revokes the previous one.</small></div>}
  </div>;
};

const localDateInputValue = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

const formatPlanLimit = value => value == null ? "Unlimited" : Number(value).toLocaleString();

const OrganizationSubscriptionPage = () => {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.get("/subscriptions/current").then(response => setSummary(response.data))
      .catch(requestError => setError(requestError.response?.data?.message || "Unable to load subscription usage"));
  }, []);
  const subscription = summary?.subscription;
  const limits = subscription && summary?.usage ? [
    ["Active employees", summary.usage.employees, subscription.max_employees],
    ["Login accounts", summary.usage.users, subscription.max_users],
    ["Candidates this term", summary.usage.candidates, subscription.max_candidates],
    ["Departments", summary.usage.departments, subscription.max_departments]
  ] : [];
  return <div>
    <PageTitle breadcrumb="Organization / Plan" title="Subscription & usage" description="Review your current plan and how much of each included allowance has been used." />
    {error && <div className="error-box">{error}</div>}
    {!error && !subscription && <div className="white-panel"><h3>No active subscription</h3><p>Ask your Super Admin to assign a plan before adding more employees, users, departments, or recruitment candidates.</p></div>}
    {subscription && <>
      <div className="white-panel subscription-summary"><div><small>Current plan</small><h2>{subscription.plan_name}</h2><p>{subscription.subscription_currency} {subscription.price_at_purchase} · {subscription.duration_months} months</p></div><div><small>Subscription dates</small><strong>{subscription.subscription_start_date?.slice(0, 10)} to {subscription.subscription_end_date?.slice(0, 10) || "No expiry"}</strong></div></div>
      <div className="summary-grid subscription-usage-grid">{limits.map(([label, used, limit]) => <article className="summary-card blue" key={label}><span>{label}</span><strong>{used} / {formatPlanLimit(limit)}</strong><small>{limit == null ? "No plan limit" : `${Math.max(0, Number(limit) - Number(used))} remaining`}</small></article>)}</div>
    </>}
  </div>;
};

const SubscriptionsPage = () => {
  const [plans, setPlans] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [planForm, setPlanForm] = useState({ name: "", durationMonths: "1", price: "", currency: "INR", maxEmployees: "", maxUsers: "", maxCandidates: "", maxDepartments: "" });
  const [assignment, setAssignment] = useState({ organizationId: "", planId: "", startDate: localDateInputValue() });

  const load = async () => {
    try {
      const [planResult, organizationResult, subscriptionResult] = await Promise.all([
        api.get("/subscriptions/plans"), api.get("/organizations"), api.get("/subscriptions")
      ]);
      setPlans(planResult.data);
      setOrganizations(organizationResult.data);
      setSubscriptions(subscriptionResult.data);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load subscriptions. Apply the latest database schema and retry.");
    }
  };
  useEffect(() => { load(); }, []);

  const createPlan = async event => {
    event.preventDefault();
    try {
      await api.post("/subscriptions/plans", planForm);
      setPlanForm({ name: "", durationMonths: "1", price: "", currency: "INR", maxEmployees: "", maxUsers: "", maxCandidates: "", maxDepartments: "" });
      setNotice("Plan created. It is now available for assignment.");
      setError("");
      await load();
    } catch (requestError) {
      setNotice("");
      setError(requestError.response?.data?.message || "Unable to create subscription plan");
    }
  };

  const assignPlan = async event => {
    event.preventDefault();
    try {
      await api.post("/subscriptions/assign", assignment);
      setNotice("Plan assigned. Any previous active subscription was replaced.");
      setError("");
      setAssignment({ organizationId: "", planId: "", startDate: localDateInputValue() });
      await load();
    } catch (requestError) {
      setNotice("");
      setError(requestError.response?.data?.message || "Unable to assign plan");
    }
  };

  const togglePlan = async plan => {
    try {
      await api.patch(`/subscriptions/plans/${plan.id}/status`, { isActive: !plan.is_active });
      setNotice(plan.is_active ? "Plan deactivated. Existing subscriptions remain in effect." : "Plan activated.");
      setError("");
      await load();
    } catch (requestError) {
      setNotice("");
      setError(requestError.response?.data?.message || "Unable to update plan");
    }
  };

  return <div>
    <PageTitle breadcrumb="Platform administration" title="Plans & subscriptions" description="Define organization packages and assign a plan term to each organization. Payment collection is not connected yet." />
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}
    <form className="form-panel" onSubmit={createPlan}>
      <h3>Create a subscription plan</h3>
      <div className="form-grid">
        <label>Plan name<input required maxLength="80" value={planForm.name} onChange={e => setPlanForm({ ...planForm, name: e.target.value })} placeholder="Growth" /></label>
        <label>Duration in months<input required type="number" min="1" step="1" value={planForm.durationMonths} onChange={e => setPlanForm({ ...planForm, durationMonths: e.target.value })} /></label>
        <label>Price<input required type="number" min="0" step="0.01" value={planForm.price} onChange={e => setPlanForm({ ...planForm, price: e.target.value })} placeholder="0" /></label>
        <label>Currency<input required minLength="3" maxLength="3" value={planForm.currency} onChange={e => setPlanForm({ ...planForm, currency: e.target.value.toUpperCase() })} placeholder="INR" /></label>
        <label>Employee limit<input type="number" min="0" step="1" value={planForm.maxEmployees} onChange={e => setPlanForm({ ...planForm, maxEmployees: e.target.value })} placeholder="Unlimited" /></label>
        <label>Login account limit<input type="number" min="0" step="1" value={planForm.maxUsers} onChange={e => setPlanForm({ ...planForm, maxUsers: e.target.value })} placeholder="Unlimited" /></label>
        <label>Recruitment candidate limit<input type="number" min="0" step="1" value={planForm.maxCandidates} onChange={e => setPlanForm({ ...planForm, maxCandidates: e.target.value })} placeholder="Unlimited" /></label>
        <label>Department limit<input type="number" min="0" step="1" value={planForm.maxDepartments} onChange={e => setPlanForm({ ...planForm, maxDepartments: e.target.value })} placeholder="Unlimited" /></label>
      </div>
      <small className="field-hint">Leave any limit blank for unlimited. Login accounts include Organization Admin, HR, managers, employees, and recruiters. Candidate limits count candidates added during the subscription term.</small>
      <button className="primary-button">Create plan</button>
    </form>

    <form className="form-panel" onSubmit={assignPlan}>
      <h3>Assign or renew an organization plan</h3>
      <div className="form-grid">
        <label>Organization<select required value={assignment.organizationId} onChange={e => setAssignment({ ...assignment, organizationId: e.target.value })}><option value="">Select organization</option>{organizations.filter(o => o.status === "ACTIVE").map(o => <option value={o.id} key={o.id}>{o.name}</option>)}</select></label>
        <label>Active plan<select required value={assignment.planId} onChange={e => setAssignment({ ...assignment, planId: e.target.value })}><option value="">Select plan</option>{plans.filter(p => p.is_active).map(p => <option value={p.id} key={p.id}>{p.name} · {p.duration_months} months · {p.currency} {p.price}</option>)}</select></label>
        <label>Starts on<input required type="date" max={localDateInputValue()} value={assignment.startDate} onChange={e => setAssignment({ ...assignment, startDate: e.target.value })} /></label>
      </div>
      <small className="field-hint">Assigning a plan replaces the organization’s current subscription. The price is recorded for this assignment; payments are not collected by this app.</small>
      <button className="primary-button">Assign plan</button>
    </form>

    <div className="white-panel table-panel"><h3>Available plans</h3>{plans.length ? <table><thead><tr><th>Plan</th><th>Term</th><th>Price</th><th>Limits</th><th>Status</th><th>Action</th></tr></thead><tbody>{plans.map(plan => <tr key={plan.id}><td>{plan.name}</td><td>{plan.duration_months} months</td><td>{plan.currency} {plan.price}</td><td>Employees: {formatPlanLimit(plan.max_employees)}<br />Accounts: {formatPlanLimit(plan.max_users)}<br />Candidates: {formatPlanLimit(plan.max_candidates)}<br />Departments: {formatPlanLimit(plan.max_departments)}</td><td>{plan.is_active ? "Active" : "Inactive"}</td><td><button className="small-button" onClick={() => togglePlan(plan)}>{plan.is_active ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table> : <div className="empty-state">Create a plan to offer subscriptions.</div>}</div>

    <div className="white-panel table-panel"><h3>Organization subscriptions</h3>{subscriptions.length ? <table><thead><tr><th>Organization</th><th>Plan</th><th>Term</th><th>Starts</th><th>Ends</th><th>Price at assignment</th><th>Status</th></tr></thead><tbody>{subscriptions.map(sub => <tr key={sub.id}><td>{sub.organization_name} ({sub.organization_code})</td><td>{sub.plan_name}</td><td>{sub.duration_months} months</td><td>{sub.start_date?.slice(0, 10)}</td><td>{sub.end_date?.slice(0, 10) || "Unlimited"}</td><td>{sub.currency} {sub.price_at_purchase}</td><td>{sub.status === "ACTIVE" && sub.end_date && sub.end_date.slice(0, 10) < localDateInputValue() ? "Expired" : sub.status}</td></tr>)}</tbody></table> : <div className="empty-state">No paid subscriptions have been assigned yet.</div>}</div>
  </div>;
};

const Attendance = ({ canRecord = true }) => {
  const [records, setRecords] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ deviceId: "", deviceUserId: "", punchTime: "", punchType: "IN" });
  const load = async () => {
    try {
      const response = await api.get("/attendance");
      setRecords(response.data);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not load attendance. Check the database setup.");
    }
  };
  useEffect(() => { load(); }, []);
  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post("/attendance/biometric-log", { ...form, punchTime: new Date(form.punchTime).toISOString() });
      setForm({ deviceId: "", deviceUserId: "", punchTime: "", punchType: "IN" });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not save biometric punch.");
    }
  };
  return (
    <div>
      <PageTitle
        breadcrumb="HRMS / Attendance"
        title="Attendance"
        description="Biometric attendance records."
      />

      <div className="white-panel">
        {canRecord && <form className="form-panel" onSubmit={submit}>
          <h3>Record a biometric punch</h3>
          <div className="form-grid">
            <label>Device ID<input required value={form.deviceId} onChange={e => setForm({ ...form, deviceId: e.target.value })} /></label>
            <label>Device user ID<input required value={form.deviceUserId} onChange={e => setForm({ ...form, deviceUserId: e.target.value })} /></label>
            <label>Punch time<input required type="datetime-local" value={form.punchTime} onChange={e => setForm({ ...form, punchTime: e.target.value })} /></label>
            <label>Punch type<select value={form.punchType} onChange={e => setForm({ ...form, punchType: e.target.value })}><option>IN</option><option>OUT</option></select></label>
          </div>
          <button className="primary-button">Save punch</button>
        </form>}
        {error && <div className="error-box">{error}</div>}
        <div className="white-panel table-panel"><h3>Today's attendance</h3>{records.length ? <table><thead><tr><th>Employee</th><th>Code</th><th>Department</th><th>Status</th><th>Check in</th><th>Check out</th></tr></thead><tbody>{records.map(row => <tr key={row.id}><td>{row.employee_name}</td><td>{row.employee_code}</td><td>{row.department_name || "-"}</td><td>{row.status}</td><td>{row.check_in || "-"}</td><td>{row.check_out || "-"}</td></tr>)}</tbody></table> : <div className="empty-state">No processed attendance records for today. Configure biometric processing to turn saved punches into daily records.</div>}</div>
      </div>
    </div>
  );
};

const Recruitment = ({ user }) => {
  const sections = {
    jobs: { label: "Job openings", url: "/recruitment/jobs", fields: [["jobTitle", "Job title"], ["jobCode", "Job code"], ["departmentId", "Department", "select"], ["location", "Location"], ["numberOfPositions", "Positions", "number"]], columns: [["job_title", "Job title"], ["department_name", "Department"], ["location", "Location"], ["status", "Status"]] },
    candidates: { label: "Candidates", url: "/recruitment/candidates", fields: [["fullName", "Full name"], ["email", "Email", "email"], ["phone", "Phone"], ["jobOpeningId", "Job ID (optional)", "number"]], columns: [["full_name", "Name"], ["email", "Email"], ["phone", "Phone"], ["stage", "Stage"], ["job_title", "Job"]] },
    requests: { label: "Hiring requests", url: "/recruitment/manpower-requests", fields: [["designation", "Role requested"], ["departmentId", "Department", "select"], ["numberOfPositions", "Positions", "number"], ["reason", "Reason"]], columns: [["designation", "Role"], ["department_name", "Department"], ["number_of_positions", "Positions"], ["status", "Status"]] }
  };
  const [section, setSection] = useState(user.role === "MANAGER" ? "requests" : "jobs");
  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({});
  const [error, setError] = useState("");
  const visibleSections = user.role === "MANAGER" ? ["requests"] : user.role === "RECRUITER" ? ["jobs", "candidates"] : ["jobs", "candidates", "requests"];
  const config = sections[section];
  const load = async () => {
    try { const response = await api.get(config.url); setRows(response.data); setError(""); }
    catch (requestError) { setError(requestError.response?.data?.message || "Could not load recruitment data. Check the database setup."); }
  };
  useEffect(() => { setForm({}); load(); api.get("/departments").then(r => setDepartments(r.data)).catch(() => {}); }, [section]);
  const submit = async event => {
    event.preventDefault();
    try { await api.post(config.url, form); setForm({}); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || "Could not save this record."); }
  };
  return (
    <div>
      <PageTitle
        breadcrumb="Recruitment / ATS"
        title="Recruitment / ATS"
        description="Manage vacancies and candidates."
      />

      <div className="toolbar">{visibleSections.map(key => <button key={key} className={section === key ? "primary-button" : "secondary-button"} onClick={() => setSection(key)}>{sections[key].label}</button>)}</div>
      <form className="form-panel" onSubmit={submit}><h3>Add {config.label.toLowerCase()}</h3><div className="form-grid">{config.fields.map(([key, label, type]) => <label key={key}>{label}{type === "select" ? <select required value={form[key] || ""} onChange={event => setForm({ ...form, [key]: event.target.value })}><option value="">Select department</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select> : <input required={!label.includes("optional")} type={type || "text"} min={type === "number" ? "1" : undefined} value={form[key] || ""} onChange={event => setForm({ ...form, [key]: event.target.value })} />}</label>)}</div><button className="primary-button">Save {section === "requests" ? "request" : section.slice(0, -1)}</button></form>
      {error && <div className="error-box">{error}</div>}
      <div className="white-panel table-panel"><h3>{config.label}</h3>{rows.length ? <table><thead><tr>{config.columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id || index}>{config.columns.map(([key]) => <td key={key}>{row[key] ?? "-"}</td>)}</tr>)}</tbody></table> : <div className="empty-state">No {config.label.toLowerCase()} found yet.</div>}</div>
    </div>
  );
};

const Support = ({ user }) => {
  const guides = {
    SUPER_ADMIN: {
      title: "Super Admin guide",
      description: "Manage the HRMS platform and its customer organizations.",
      sections: [
        ["Create an organization", "Add each customer company and keep its account status up to date.", "/organizations", "Open organizations"],
        ["Set up organization access", "Create an Organization Admin account for each active organization. That admin manages the organization’s HR data and user access.", "/organizations", "Manage organization access"]
      ]
    },
    ORG_ADMIN: {
      title: "Organization Admin guide",
      description: `Set up ${user.organizationName || "your organization"} and manage its HR workflows.`,
      sections: [
        ["1. Users & roles", "Create HR and recruiter accounts first. Manager accounts need a department, and employee accounts must be linked to an employee record.", "/users", "Open users & roles"],
        ["2. Departments", "Add departments and assign department managers. Create departments before manager accounts that need them.", "/departments", "Open departments"],
        ["3. Designations", "Add the job titles used by your organization.", "/designations", "Open designations"],
        ["4. Employees", "Create employee records and assign each person to a department and designation. Then return to Users & roles to create and link their login.", "/employees", "Open employees"],
        ["Subscription & usage", "Check your plan dates and remaining employee, account, candidate, and department allowances. Ask the Super Admin if you need more capacity.", "/subscription", "View plan usage"],
        ["Ongoing HR operations", "Manage onboarding, attendance, recruitment, approvals, exits, payroll, and reports from the matching sidebar pages.", "/attendance", "Open attendance"]
      ]
    },
    HR: {
      title: "HR guide",
      description: "Manage employee records and day-to-day people operations for your organization.",
      sections: [
        ["Employee records", "Add employees and keep their department, designation, and contact details up to date.", "/employees", "Open employees"],
        ["Attendance and leave", "Review attendance records and process leave requests using the Attendance and Leave approvals pages.", "/attendance", "Open attendance"],
        ["Hiring and onboarding", "Track jobs, candidates, interviews, and employee onboarding tasks.", "/recruitment", "Open recruitment"],
        ["Payroll and reports", "Create monthly payroll records and review organization summaries.", "/payroll", "Open payroll"]
      ]
    },
    MANAGER: {
      title: "Department Manager guide",
      description: "Use the portal to manage requests and activity for your assigned department.",
      sections: [
        ["Review your team", "View employees and team attendance for your department.", "/employees", "Open my team"],
        ["Approve requests", "Review leave and exit requests submitted by your team.", "/leave-approvals", "Open approvals"],
        ["Hiring and onboarding", "Submit hiring requests, coordinate interviews, and follow onboarding tasks.", "/recruitment", "Open hiring"]
      ]
    },
    EMPLOYEE: {
      title: "Employee guide",
      description: "Use your employee portal for your own work information and requests.",
      sections: [
        ["Your profile and attendance", "View your employee details and recent attendance records.", "/profile", "Open my profile"],
        ["Leave and exit requests", "Submit requests and return to the pages to follow their status.", "/my-leaves", "Open my leave"],
        ["Payslips and onboarding", "View payroll records released to your account, assigned onboarding tasks, and company assets.", "/payroll", "Open my payslips"]
      ]
    },
    RECRUITER: {
      title: "Recruiter guide",
      description: "Manage hiring activity and keep candidate progress current.",
      sections: [
        ["Jobs and candidates", "Create or update vacancies and track candidates through the hiring pipeline.", "/recruitment", "Open recruitment"],
        ["Interviews", "Schedule interviews and update their progress after each stage.", "/interviews", "Open interviews"]
      ]
    }
  };
  const guide = guides[user.role] || guides.EMPLOYEE;
  return (
    <div>
      <PageTitle
        breadcrumb={`${user.role.replaceAll("_", " ")} / Help`}
        title={guide.title}
        description={guide.description}
      />
      <div className="help-guide-grid">{guide.sections.map(([title, description, path, action]) => <article className="white-panel help-guide-card" key={title}><h3>{title}</h3><p>{description}</p><Link className="secondary-button" to={path}>{action}</Link></article>)}</div>
    </div>
  );
};

const PageTitle = ({
  breadcrumb,
  title,
  description
}) => {
  return (
    <div className="page-title">
      <small>{breadcrumb}</small>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
};

const DesignationsPage = () => {
  const [rows, setRows] = useState([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const load = async () => { try { const r = await api.get("/designations"); setRows(r.data); setError(""); } catch (e) { setError(e.response?.data?.message || "Unable to load designations"); } };
  useEffect(() => { load(); }, []);
  const submit = async e => { e.preventDefault(); try { await api.post("/designations", { title }); setTitle(""); await load(); } catch (error) { setError(error.response?.data?.message || "Unable to create designation"); } };
  const remove = async id => { try { await api.delete(`/designations/${id}`); await load(); } catch (e) { setError(e.response?.data?.message || "Unable to delete designation"); } };
  return <div><PageTitle breadcrumb="Organization / Structure" title="Designations" description="Maintain the job titles used in employee records." /><form className="form-panel" onSubmit={submit}><h3>Add designation</h3><div className="form-grid"><label>Title<input required value={title} onChange={e => setTitle(e.target.value)} /></label></div><button className="primary-button">Save designation</button></form>{error && <div className="error-box">{error}</div>}<div className="white-panel table-panel">{rows.length ? <table><thead><tr><th>Title</th><th>Action</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.title}</td><td><button className="small-button danger" onClick={() => remove(row.id)}>Delete</button></td></tr>)}</tbody></table> : <div className="empty-state">No designations have been added.</div>}</div></div>;
};

const OnboardingPage = ({ role }) => {
  const self = role === "EMPLOYEE";
  const canCreate = ["HR", "ORG_ADMIN"].includes(role);
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ employeeId: "", title: "", description: "", dueDate: "" });
  const [error, setError] = useState("");
  const load = async () => { try { const r = await api.get(self ? "/onboarding/mine" : "/onboarding"); setRows(r.data); setError(""); } catch (e) { setError(e.response?.data?.message || "Unable to load onboarding tasks"); } };
  useEffect(() => { load(); if (canCreate) api.get("/employees").then(r => setEmployees(r.data)).catch(() => {}); }, []);
  const create = async e => { e.preventDefault(); try { await api.post("/onboarding", form); setForm({ employeeId: "", title: "", description: "", dueDate: "" }); await load(); } catch (error) { setError(error.response?.data?.message || "Unable to create task"); } };
  const update = async (id, status) => { try { await api.patch(`/onboarding/${id}`, { status }); await load(); } catch (e) { setError(e.response?.data?.message || "Unable to update task"); } };
  return <div><PageTitle breadcrumb="People / Onboarding" title={self ? "My onboarding" : "Onboarding tasks"} description="Track employee onboarding checklists and completion." />{canCreate && <form className="form-panel" onSubmit={create}><h3>Assign onboarding task</h3><div className="form-grid"><label>Employee<select required value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })}><option value="">Select employee</option>{employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name} · {emp.employee_code}</option>)}</select></label><label>Task<input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label><label>Due date<input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></label><label>Details<input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label></div><button className="primary-button">Assign task</button></form>}{error && <div className="error-box">{error}</div>}<div className="white-panel table-panel">{rows.length ? <table><thead><tr>{!self && <th>Employee</th>}<th>Task</th><th>Due</th><th>Status</th>{(self || canCreate) && <th>Action</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.id}>{!self && <td>{row.employee_name}</td>}<td>{row.title}<small>{row.description}</small></td><td>{row.due_date?.slice(0, 10) || "-"}</td><td>{row.status}</td>{(self || canCreate) && <td>{row.status !== "COMPLETE" && <button className="small-button" onClick={() => update(row.id, row.status === "PENDING" ? "IN_PROGRESS" : "COMPLETE")}>{row.status === "PENDING" ? "Start" : "Complete"}</button>}</td>}</tr>)}</tbody></table> : <div className="empty-state">No onboarding tasks to show.</div>}</div></div>;
};

const ExitPage = ({ role }) => {
  const self = role === "EMPLOYEE";
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ reason: "", lastWorkingDate: "" });
  const [error, setError] = useState("");
  const load = async () => { try { const r = await api.get(self ? "/exits/mine" : "/exits"); setRows(r.data); setError(""); } catch (e) { setError(e.response?.data?.message || "Unable to load exit requests"); } };
  useEffect(() => { load(); }, []);
  const create = async e => { e.preventDefault(); try { await api.post("/exits/mine", form); setForm({ reason: "", lastWorkingDate: "" }); await load(); } catch (error) { setError(error.response?.data?.message || "Unable to submit request"); } };
  const review = async (id, status) => { try { await api.patch(`/exits/${id}/review`, { status }); await load(); } catch (e) { setError(e.response?.data?.message || "Unable to review exit"); } };
  return <div><PageTitle breadcrumb="People / Offboarding" title={self ? "My exit request" : "Exit management"} description="Submit and review employee separation requests." />{self && <form className="form-panel" onSubmit={create}><h3>Submit an exit request</h3><div className="form-grid"><label>Proposed last working day<input required type="date" value={form.lastWorkingDate} onChange={e => setForm({ ...form, lastWorkingDate: e.target.value })} /></label><label>Reason<input required value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></label></div><button className="primary-button">Submit request</button></form>}{error && <div className="error-box">{error}</div>}<div className="white-panel table-panel">{rows.length ? <table><thead><tr>{!self && <th>Employee</th>}<th>Last day</th><th>Reason</th><th>Status</th>{!self && <th>Action</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.id}>{!self && <td>{row.employee_name}</td>}<td>{row.last_working_date?.slice(0, 10)}</td><td>{row.reason}</td><td>{row.status}</td>{!self && <td>{row.status === "PENDING" && <><button className="small-button" onClick={() => review(row.id, "APPROVED")}>Approve</button> <button className="small-button danger" onClick={() => review(row.id, "REJECTED")}>Reject</button></>}</td>}</tr>)}</tbody></table> : <div className="empty-state">No exit requests to show.</div>}</div></div>;
};

const AssetsPage = ({ role }) => {
  const self = role === "EMPLOYEE";
  const canManage = ["HR", "ORG_ADMIN"].includes(role);
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ assetTag: "", name: "", category: "", serialNumber: "" });
  const [assignment, setAssignment] = useState({ assetId: "", employeeId: "" });
  const [error, setError] = useState("");
  const load = async () => { try { const r = await api.get(self ? "/assets/mine" : "/assets"); setRows(r.data); setError(""); } catch (e) { setError(e.response?.data?.message || "Unable to load assets"); } };
  useEffect(() => { load(); if (canManage) api.get("/employees").then(r => setEmployees(r.data)).catch(() => {}); }, []);
  const create = async e => { e.preventDefault(); try { await api.post("/assets", form); setForm({ assetTag: "", name: "", category: "", serialNumber: "" }); await load(); } catch (error) { setError(error.response?.data?.message || "Unable to add asset"); } };
  const assign = async e => { e.preventDefault(); try { await api.post(`/assets/${assignment.assetId}/assign`, { employeeId: assignment.employeeId }); setAssignment({ assetId: "", employeeId: "" }); await load(); } catch (error) { setError(error.response?.data?.message || "Unable to assign asset"); } };
  const returnAsset = async id => { try { await api.post(`/assets/${id}/return`); await load(); } catch (e) { setError(e.response?.data?.message || "Unable to return asset"); } };
  return <div><PageTitle breadcrumb="People / Assets" title={self ? "My assigned assets" : "Asset management"} description="Track inventory and employee asset assignments." />{canManage && <><form className="form-panel" onSubmit={create}><h3>Add inventory item</h3><div className="form-grid"><label>Asset tag<input required value={form.assetTag} onChange={e => setForm({ ...form, assetTag: e.target.value })} /></label><label>Name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label>Category<input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></label><label>Serial number<input value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })} /></label></div><button className="primary-button">Add asset</button></form><form className="form-panel" onSubmit={assign}><h3>Assign available asset</h3><div className="form-grid"><label>Asset<select required value={assignment.assetId} onChange={e => setAssignment({ ...assignment, assetId: e.target.value })}><option value="">Select asset</option>{rows.filter(r => r.status === "AVAILABLE").map(r => <option key={r.id} value={r.id}>{r.asset_tag} · {r.name}</option>)}</select></label><label>Employee<select required value={assignment.employeeId} onChange={e => setAssignment({ ...assignment, employeeId: e.target.value })}><option value="">Select employee</option>{employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}</select></label></div><button className="primary-button">Assign asset</button></form></>}{error && <div className="error-box">{error}</div>}<div className="white-panel table-panel">{rows.length ? <table><thead><tr><th>Tag</th><th>Asset</th><th>Category</th><th>Status</th>{!self && <th>Assigned to</th>}{canManage && <th>Action</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.asset_tag}</td><td>{row.name}</td><td>{row.category || "-"}</td><td>{self ? "Assigned" : row.status}</td>{!self && <td>{row.assigned_to || "-"}</td>}{canManage && <td>{row.status === "ASSIGNED" && <button className="small-button" onClick={() => returnAsset(row.id)}>Mark returned</button>}</td>}</tr>)}</tbody></table> : <div className="empty-state">No assets to show.</div>}</div></div>;
};

const PayrollPage = ({ role }) => {
  const self = role === "EMPLOYEE";
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ employeeId: "", periodStart: "", grossPay: "", deductions: "0", currency: "INR" });
  const [error, setError] = useState("");
  const load = async () => { try { const r = await api.get(self ? "/payroll/mine" : "/payroll"); setRows(r.data); setError(""); } catch (e) { setError(e.response?.data?.message || "Unable to load payroll"); } };
  useEffect(() => { load(); if (!self) api.get("/employees").then(r => setEmployees(r.data)).catch(() => {}); }, []);
  const create = async e => { e.preventDefault(); try { await api.post("/payroll", { ...form, periodStart: `${form.periodStart}-01` }); setForm({ employeeId: "", periodStart: "", grossPay: "", deductions: "0", currency: "INR" }); await load(); } catch (error) { setError(error.response?.data?.message || "Unable to create payroll record"); } };
  const markPaid = async id => { try { await api.patch(`/payroll/${id}/paid`); await load(); } catch (e) { setError(e.response?.data?.message || "Unable to mark paid"); } };
  return <div><PageTitle breadcrumb="People / Payroll" title={self ? "My payslips" : "Payroll"} description={self ? "View payroll records released for your account." : "Create monthly payroll records and record payment status."} />{!self && <form className="form-panel" onSubmit={create}><h3>Create monthly payroll record</h3><div className="form-grid"><label>Employee<select required value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })}><option value="">Select employee</option>{employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name} · {emp.employee_code}</option>)}</select></label><label>Payroll month<input required type="month" value={form.periodStart} onChange={e => setForm({ ...form, periodStart: e.target.value })} /></label><label>Gross pay<input required type="number" min="0" step="0.01" value={form.grossPay} onChange={e => setForm({ ...form, grossPay: e.target.value })} /></label><label>Deductions<input type="number" min="0" step="0.01" value={form.deductions} onChange={e => setForm({ ...form, deductions: e.target.value })} /></label><label>Currency<input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></label></div><button className="primary-button">Save payroll</button></form>}{error && <div className="error-box">{error}</div>}<div className="white-panel table-panel">{rows.length ? <table><thead><tr>{!self && <th>Employee</th>}<th>Period</th><th>Gross</th><th>Deductions</th><th>Net pay</th><th>Status</th>{!self && <th>Action</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.id}>{!self && <td>{row.employee_name}</td>}<td>{row.period_start?.slice(0, 7)}</td><td>{row.currency} {row.gross_pay}</td><td>{row.currency} {row.deductions}</td><td>{row.currency} {row.net_pay}</td><td>{row.status}</td>{!self && <td>{row.status === "DRAFT" && <button className="small-button" onClick={() => markPaid(row.id)}>Mark paid</button>}</td>}</tr>)}</tbody></table> : <div className="empty-state">No payroll records to show.</div>}</div></div>;
};

const InterviewsPage = () => {
  const [rows, setRows] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [form, setForm] = useState({ candidateId: "", scheduledAt: "", interviewType: "VIDEO", locationOrLink: "" });
  const [error, setError] = useState("");
  const load = async () => { try { const r = await api.get("/interviews"); setRows(r.data); setError(""); } catch (e) { setError(e.response?.data?.message || "Unable to load interviews"); } };
  useEffect(() => { load(); api.get("/recruitment/candidates").then(r => setCandidates(r.data)).catch(() => {}); }, []);
  const create = async e => { e.preventDefault(); try { await api.post("/interviews", { ...form, scheduledAt: new Date(form.scheduledAt).toISOString() }); setForm({ candidateId: "", scheduledAt: "", interviewType: "VIDEO", locationOrLink: "" }); await load(); } catch (error) { setError(error.response?.data?.message || "Unable to schedule interview"); } };
  const update = async (id, status) => { try { await api.patch(`/interviews/${id}`, { status }); await load(); } catch (e) { setError(e.response?.data?.message || "Unable to update interview"); } };
  return <div><PageTitle breadcrumb="Recruitment / Interviews" title="Interviews" description="Schedule candidate interviews and track their status." /><form className="form-panel" onSubmit={create}><h3>Schedule interview</h3><div className="form-grid"><label>Candidate<select required value={form.candidateId} onChange={e => setForm({ ...form, candidateId: e.target.value })}><option value="">Select candidate</option>{candidates.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></label><label>When<input required type="datetime-local" value={form.scheduledAt} onChange={e => setForm({ ...form, scheduledAt: e.target.value })} /></label><label>Type<select value={form.interviewType} onChange={e => setForm({ ...form, interviewType: e.target.value })}><option>VIDEO</option><option>PHONE</option><option>IN_PERSON</option></select></label><label>Location or meeting link<input value={form.locationOrLink} onChange={e => setForm({ ...form, locationOrLink: e.target.value })} /></label></div><button className="primary-button">Schedule interview</button></form>{error && <div className="error-box">{error}</div>}<div className="white-panel table-panel">{rows.length ? <table><thead><tr><th>Candidate</th><th>Role</th><th>When</th><th>Type</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map(i => <tr key={i.id}><td>{i.candidate_name}</td><td>{i.job_title || "-"}</td><td>{new Date(i.scheduled_at).toLocaleString()}</td><td>{i.interview_type}</td><td>{i.status}</td><td>{i.status === "SCHEDULED" && <button className="small-button" onClick={() => update(i.id, "COMPLETED")}>Mark complete</button>}</td></tr>)}</tbody></table> : <div className="empty-state">No interviews scheduled.</div>}</div></div>;
};

const ReportsPage = () => {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api.get("/reports/summary").then(r => setSummary(r.data)).catch(e => setError(e.response?.data?.message || "Unable to load reports")); }, []);
  return <div><PageTitle breadcrumb="Analytics / Reports" title="HR reports" description="Live organization summary from PostgreSQL records." />{error && <div className="error-box">{error}</div>}<div className="summary-grid">{[["Active employees", "active_employees", "blue"], ["Departments", "departments", "purple"], ["Open jobs", "open_jobs", "orange"], ["Pending leave", "pending_leaves", "green"], ["Pending exits", "pending_exits", "blue"], ["Payroll paid", "paid_payroll_records", "purple"]].map(([label, key, color]) => <article className={`summary-card ${color}`} key={key}><span>{label}</span><strong>{summary?.[key] ?? "—"}</strong><small>Current totals</small></article>)}</div></div>;
};

const NotificationsPage = () => {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const load = async () => { try { const r = await api.get("/notifications"); setRows(r.data); setError(""); } catch (e) { setError(e.response?.data?.message || "Unable to load notifications"); } };
  useEffect(() => { load(); }, []);
  const markRead = async id => { try { await api.patch(`/notifications/${id}/read`); await load(); } catch (e) { setError(e.response?.data?.message || "Unable to update notification"); } };
  return <div><PageTitle breadcrumb="My workspace / Updates" title="Notifications" description="Your HRMS updates and approval notifications." />{error && <div className="error-box">{error}</div>}<div className="white-panel">{rows.length ? rows.map(n => <article className="notification-row" key={n.id}><div><strong>{n.title}</strong><p>{n.body}</p><small>{new Date(n.created_at).toLocaleString()}</small></div>{!n.read_at && <button className="small-button" onClick={() => markRead(n.id)}>Mark read</button>}</article>) : <div className="empty-state">No notifications yet.</div>}</div></div>;
};

const NotificationBell = () => (
  <Link className="notification-bell" to="/notifications" aria-label="Open notifications" title="Notifications">
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </svg>
  </Link>
);

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: "HR", departmentId: "", employeeId: "" });
  const load = async () => {
    try {
      const [userResult, employeeResult, departmentResult] = await Promise.all([api.get("/users"), api.get("/employees"), api.get("/departments")]);
      setUsers(userResult.data);
      setEmployees(employeeResult.data);
      setDepartments(departmentResult.data);
      setError("");
    } catch (requestError) { setError(requestError.response?.data?.message || "Unable to load organization accounts"); }
  };
  useEffect(() => { load(); }, []);
  const submit = async event => {
    event.preventDefault();
    const emailError = getEmailValidationError(form.email);
    const passwordError = getPasswordValidationError(form.password);
    if (emailError || passwordError) {
      setError(emailError || passwordError);
      return;
    }
    try {
      await api.post("/users", { ...form, departmentId: form.departmentId || null, employeeId: form.employeeId || null });
      setForm({ fullName: "", email: "", password: "", role: "HR", departmentId: "", employeeId: "" });
      await load();
    } catch (requestError) { setError(requestError.response?.data?.message || "Unable to create account"); }
  };
  return <div><PageTitle breadcrumb="Organization / Access" title="Users & role access" description="Create separate HR, department manager, recruiter, and employee logins." />
    <form className="form-panel" onSubmit={submit}><h3>Create a user account</h3><div className="form-grid">
      <label>Full name<input required value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} /></label>
      <label>Email<input required type="email" autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
      <label>Temporary password<input required type="password" minLength="8" autoComplete="new-password" title="Use 8+ characters with uppercase, lowercase, a number, and a special character." value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /><small className="field-hint">Use 8+ characters with uppercase, lowercase, a number, and a special character.</small></label>
      <label>Portal role<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value, departmentId: "", employeeId: "" })}><option value="HR">HR</option><option value="MANAGER">Department Manager</option><option value="EMPLOYEE">Employee</option><option value="RECRUITER">Recruiter</option></select></label>
      {form.role === "MANAGER" && <label>Managed department<select required value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })}><option value="">Select a department</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
      {form.role === "EMPLOYEE" && <label>Employee record<select required value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })}><option value="">Select employee</option>{employees.filter(e => !e.has_login).map(e => <option key={e.id} value={e.id}>{e.full_name} Â· {e.employee_code}</option>)}</select></label>}
    </div><button className="primary-button">Create account</button></form>
    {error && <div className="error-box">{error}</div>}
    <div className="white-panel table-panel"><h3>Organization accounts</h3>{users.length ? <table><thead><tr><th>Name</th><th>Email</th><th>Portal</th><th>Department</th><th>Employee</th><th>Status</th></tr></thead><tbody>{users.map(u => <tr key={u.id}><td>{u.full_name}</td><td>{u.email}</td><td>{u.role === "MANAGER" ? "Department Manager" : u.role}</td><td>{u.department_name || "-"}</td><td>{u.employee_code || "-"}</td><td>{u.status}</td></tr>)}</tbody></table> : <div className="empty-state">No organization accounts yet.</div>}</div>
  </div>;
};

const MyLeavePage = () => {
  const [leaves, setLeaves] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ leaveType: "Casual", startDate: "", endDate: "", reason: "" });
  const load = async () => { try { const r = await api.get("/leaves/mine"); setLeaves(r.data); setError(""); } catch (e) { setError(e.response?.data?.message || "Unable to load your leave requests"); } };
  useEffect(() => { load(); }, []);
  const submit = async event => { event.preventDefault(); try { await api.post("/leaves/mine", form); setForm({ leaveType: "Casual", startDate: "", endDate: "", reason: "" }); await load(); } catch (e) { setError(e.response?.data?.message || "Unable to submit leave request"); } };
  return <div><PageTitle breadcrumb="My workspace / Leave" title="My leave requests" description="Submit leave and follow its approval status." />
    <form className="form-panel" onSubmit={submit}><h3>Request leave</h3><div className="form-grid"><label>Leave type<select value={form.leaveType} onChange={e => setForm({ ...form, leaveType: e.target.value })}><option>Casual</option><option>Sick</option><option>Annual</option><option>Unpaid</option></select></label><label>From<input required type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></label><label>To<input required type="date" min={form.startDate || undefined} value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></label><label>Reason<input required value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></label></div><button className="primary-button">Submit request</button></form>
    {error && <div className="error-box">{error}</div>}
    <div className="white-panel table-panel"><h3>Request history</h3>{leaves.length ? <table><thead><tr><th>Type</th><th>Dates</th><th>Reason</th><th>Status</th><th>Review note</th></tr></thead><tbody>{leaves.map(l => <tr key={l.id}><td>{l.leave_type}</td><td>{l.start_date?.slice(0, 10)} to {l.end_date?.slice(0, 10)}</td><td>{l.reason}</td><td>{l.status}</td><td>{l.review_note || "-"}</td></tr>)}</tbody></table> : <div className="empty-state">You have not submitted a leave request.</div>}</div>
  </div>;
};

const LeaveApprovals = () => {
  const [leaves, setLeaves] = useState([]);
  const [error, setError] = useState("");
  const load = async () => { try { const r = await api.get("/leaves/requests"); setLeaves(r.data); setError(""); } catch (e) { setError(e.response?.data?.message || "Unable to load approvals"); } };
  useEffect(() => { load(); }, []);
  const review = async (id, status) => { try { await api.patch(`/leaves/requests/${id}/review`, { status }); await load(); } catch (e) { setError(e.response?.data?.message || "Unable to update request"); } };
  return <div><PageTitle breadcrumb="People / Approvals" title="Leave approvals" description="Review requests for your department or organization." />{error && <div className="error-box">{error}</div>}<div className="white-panel table-panel">{leaves.length ? <table><thead><tr><th>Employee</th><th>Department</th><th>Type</th><th>Dates</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead><tbody>{leaves.map(l => <tr key={l.id}><td>{l.employee_name}</td><td>{l.department_name || "-"}</td><td>{l.leave_type}</td><td>{l.start_date?.slice(0, 10)} to {l.end_date?.slice(0, 10)}</td><td>{l.reason}</td><td>{l.status}</td><td>{l.status === "PENDING" ? <><button className="small-button" onClick={() => review(l.id, "APPROVED")}>Approve</button> <button className="small-button danger" onClick={() => review(l.id, "REJECTED")}>Reject</button></> : l.review_note || "Reviewed"}</td></tr>)}</tbody></table> : <div className="empty-state">No leave requests are waiting for review.</div>}</div></div>;
};

const MyProfile = () => {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api.get("/employees/me").then(r => setProfile(r.data)).catch(e => setError(e.response?.data?.message || "Unable to load profile")); }, []);
  return <div><PageTitle breadcrumb="My workspace / Profile" title="My profile" description="Your employment and contact information." />{error && <div className="error-box">{error}</div>}{profile && <div className="white-panel profile-panel"><h3>{profile.full_name}</h3><p><strong>Employee code:</strong> {profile.employee_code}</p><p><strong>Department:</strong> {profile.department_name || "-"}</p><p><strong>Designation:</strong> {profile.designation_name || "-"}</p><p><strong>Email:</strong> {profile.official_email || "-"}</p><p><strong>Phone:</strong> {profile.phone || "-"}</p><p><strong>Joining date:</strong> {profile.joining_date?.slice(0, 10) || "-"}</p><p><strong>Employment status:</strong> {profile.employment_status}</p></div>}</div>;
};

const MyAttendance = () => {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { api.get("/attendance/mine").then(r => setRows(r.data)).catch(e => setError(e.response?.data?.message || "Unable to load attendance")); }, []);
  return <div><PageTitle breadcrumb="My workspace / Attendance" title="My attendance" description="Your recent processed attendance records." />{error && <div className="error-box">{error}</div>}<div className="white-panel table-panel">{rows.length ? <table><thead><tr><th>Date</th><th>Status</th><th>Check in</th><th>Check out</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.attendance_date?.slice(0, 10)}</td><td>{row.status}</td><td>{row.check_in || "-"}</td><td>{row.check_out || "-"}</td></tr>)}</tbody></table> : <div className="empty-state">No attendance records are available yet.</div>}</div></div>;
};

const EmployeeDashboard = () => {
  const [profile, setProfile] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  useEffect(() => {
    Promise.allSettled([api.get("/employees/me"), api.get("/attendance/mine"), api.get("/leaves/mine")]).then(([p, a, l]) => {
      if (p.status === "fulfilled") setProfile(p.value.data);
      if (a.status === "fulfilled") setAttendance(a.value.data);
      if (l.status === "fulfilled") setLeaves(l.value.data);
    });
  }, []);
  return <div><PageTitle breadcrumb="My workspace" title={`Welcome${profile ? `, ${profile.first_name}` : ""}`} description="Your personal attendance, leave, and employment information." /><div className="summary-grid"><article className="summary-card blue"><span>Department</span><strong>{profile?.department_name || "—"}</strong><small>{profile?.designation_name || "Employee"}</small></article><article className="summary-card purple"><span>Attendance entries</span><strong>{attendance.length}</strong><small>Recent records</small></article><article className="summary-card orange"><span>Pending leave</span><strong>{leaves.filter(l => l.status === "PENDING").length}</strong><small>Awaiting approval</small></article></div><div className="toolbar"><Link className="primary-button" to="/my-leaves">Request leave</Link><Link className="secondary-button" to="/my-attendance">View attendance</Link><Link className="secondary-button" to="/profile">My profile</Link></div></div>;
};

const ManagerDashboard = () => {
  const [counts, setCounts] = useState({ employees: "-", pending: "-" });
  useEffect(() => { Promise.allSettled([api.get("/employees"), api.get("/leaves/requests")]).then(([employees, leaves]) => setCounts({ employees: employees.status === "fulfilled" ? employees.value.data.length : "-", pending: leaves.status === "fulfilled" ? leaves.value.data.filter(l => l.status === "PENDING").length : "-" })); }, []);
  return <div><PageTitle breadcrumb="Department / Overview" title="Manager dashboard" description="Your team, department activity, and pending decisions." /><div className="summary-grid"><article className="summary-card blue"><span>Team members</span><strong>{counts.employees}</strong><small>Employees in your department</small></article><article className="summary-card orange"><span>Pending leave approvals</span><strong>{counts.pending}</strong><small>Requests awaiting review</small></article></div><div className="toolbar"><Link className="primary-button" to="/employees">View my team</Link><Link className="secondary-button" to="/leave-approvals">Review leave</Link><Link className="secondary-button" to="/attendance">Department attendance</Link></div></div>;
};

const RecruiterDashboard = () => {
  const [counts, setCounts] = useState({ jobs: "—", candidates: "—" });
  useEffect(() => { Promise.allSettled([api.get("/recruitment/jobs"), api.get("/recruitment/candidates")]).then(([jobs, candidates]) => setCounts({ jobs: jobs.status === "fulfilled" ? jobs.value.data.length : "—", candidates: candidates.status === "fulfilled" ? candidates.value.data.length : "—" })); }, []);
  return <div><PageTitle breadcrumb="Talent acquisition / Overview" title="Recruitment dashboard" description="Track open positions and candidates across your hiring pipeline." /><div className="summary-grid"><article className="summary-card blue"><span>Job openings</span><strong>{counts.jobs}</strong><small>Organization vacancies</small></article><article className="summary-card purple"><span>Candidates</span><strong>{counts.candidates}</strong><small>In the recruitment pipeline</small></article></div><div className="toolbar"><Link className="primary-button" to="/recruitment">Manage recruitment</Link></div></div>;
};

const PlatformDashboard = () => {
  const [organizations, setOrganizations] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  useEffect(() => {
    Promise.allSettled([api.get("/organizations"), api.get("/subscriptions")]).then(([orgs, subs]) => {
      if (orgs.status === "fulfilled") setOrganizations(orgs.value.data);
      if (subs.status === "fulfilled") setSubscriptions(subs.value.data);
    });
  }, []);
  const today = localDateInputValue();
  const activeSubscriptions = subscriptions.filter(sub => sub.status === "ACTIVE" && (!sub.end_date || sub.end_date.slice(0, 10) >= today)).length;
  return <div><PageTitle breadcrumb="Platform / Overview" title="Super admin dashboard" description="Manage customer organizations and their administrators." /><div className="summary-grid"><article className="summary-card blue"><span>Organizations</span><strong>{organizations.length}</strong><small>Registered tenants</small></article><article className="summary-card green"><span>Active organizations</span><strong>{organizations.filter(o => o.status === "ACTIVE").length}</strong><small>Ready to use</small></article><article className="summary-card purple"><span>Active paid subscriptions</span><strong>{activeSubscriptions}</strong><small>Commercial plans assigned</small></article></div><div className="toolbar"><Link className="primary-button" to="/organizations">Manage organizations</Link><Link className="secondary-button" to="/subscriptions">Plans & subscriptions</Link></div></div>;
};

const DEFAULT_BRANDING = {
  brand_primary_color: "#356ee9",
  brand_sidebar_color: "#21ad72",
  brand_background_color: "#f4f7fc",
  brand_font: "DM Sans",
  brand_logo_data: null,
  brand_show_logo: true
};

const OrganizationBrandingPage = ({ branding, onBrandingChange }) => {
  const [form, setForm] = useState({ ...DEFAULT_BRANDING });
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (branding) setForm({
      brand_primary_color: branding.brand_primary_color || DEFAULT_BRANDING.brand_primary_color,
      brand_sidebar_color: branding.brand_sidebar_color || DEFAULT_BRANDING.brand_sidebar_color,
      brand_background_color: branding.brand_background_color || DEFAULT_BRANDING.brand_background_color,
      brand_font: branding.brand_font || DEFAULT_BRANDING.brand_font,
      brand_logo_data: branding.brand_logo_data || null,
      brand_show_logo: branding.brand_show_logo !== false
    });
  }, [branding]);

  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const selectLogo = event => {
    const selected = event.target.files?.[0];
    setFile(null);
    if (!selected) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(selected.type) || selected.size > 200 * 1024) {
      setError("Choose a PNG, JPEG, WebP, or GIF image smaller than 200 KB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      update("brand_logo_data", reader.result);
      setFile(selected.name);
      setError("");
      setMessage("");
    };
    reader.onerror = () => setError("Unable to read this image file.");
    reader.readAsDataURL(selected);
  };

  const save = async event => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await api.patch("/organizations/branding", {
        primaryColor: form.brand_primary_color,
        sidebarColor: form.brand_sidebar_color,
        backgroundColor: form.brand_background_color,
        font: form.brand_font,
        logoData: form.brand_logo_data,
        showLogo: form.brand_show_logo
      });
      onBrandingChange(response.data.branding);
      setMessage("Organization branding saved and applied to this organization.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to save organization branding.");
    } finally {
      setLoading(false);
    }
  };

  const resetColors = () => {
    setForm(current => ({ ...current, ...DEFAULT_BRANDING, brand_logo_data: current.brand_logo_data, brand_show_logo: current.brand_show_logo }));
    setFile(null);
    setMessage("");
  };

  return <div>
    <PageTitle breadcrumb="Organization / Appearance" title="Organization branding" description="Choose the colors and font your organization sees across its HRMS workspace." />
    <form className="form-panel branding-form" onSubmit={save}>
      <h3>Workspace appearance</h3>
      <p className="branding-note">These choices apply to your organization’s signed-in accounts. The Super Admin portal keeps the Whatsoft branding.</p>
      <div className="form-grid branding-controls">
        <label>Main color<input type="color" value={form.brand_primary_color} onChange={e => update("brand_primary_color", e.target.value)} /><small className="field-hint">Buttons, links, and highlights</small></label>
        <label>Sidebar color<input type="color" value={form.brand_sidebar_color} onChange={e => update("brand_sidebar_color", e.target.value)} /><small className="field-hint">Navigation background</small></label>
        <label>Workspace background<input type="color" value={form.brand_background_color} onChange={e => update("brand_background_color", e.target.value)} /><small className="field-hint">Page background behind panels</small></label>
        <label>Font<select value={form.brand_font} onChange={e => update("brand_font", e.target.value)}>{["DM Sans", "Arial", "Georgia", "Trebuchet MS", "Verdana"].map(font => <option key={font}>{font}</option>)}</select><small className="field-hint">Preview updates as you choose</small></label>
      </div>
      <div className="branding-logo-control">
        <div><strong>Organization logo</strong><small className="field-hint">PNG, JPEG, WebP, or GIF · up to 200 KB · displayed at a compact size</small></div>
        <label className="branding-toggle"><input type="checkbox" checked={form.brand_show_logo} onChange={e => update("brand_show_logo", e.target.checked)} /> Show logo</label>
        <label className="branding-upload">{form.brand_logo_data ? "Change logo" : "Add logo"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={selectLogo} /></label>
        {form.brand_logo_data && <button type="button" className="small-button danger" onClick={() => { update("brand_logo_data", null); setFile(null); setMessage(""); }}>Remove uploaded logo</button>}
      </div>
      {(file || form.brand_logo_data) && <div className="branding-preview"><span>Logo preview</span><img src={form.brand_logo_data} alt="Organization logo preview" />{file && <small>{file}</small>}</div>}
      <div className="branding-preview theme-preview" style={{ "--preview-primary": form.brand_primary_color, "--preview-sidebar": form.brand_sidebar_color, "--preview-background": form.brand_background_color, fontFamily: form.brand_font }}><div className="theme-preview-sidebar" /> <div><strong>Live preview</strong><p>Your organization workspace uses this font and color palette.</p><button type="button">Example button</button></div></div>
      {error && <div className="error-box">{error}</div>}{message && <div className="success-box">{message}</div>}
      <div className="branding-actions"><button className="primary-button" disabled={loading}>{loading ? "Saving…" : "Save branding"}</button><button type="button" className="secondary-button" onClick={resetColors}>Reset colors and font</button></div>
    </form>
  </div>;
};

const Portal = ({ user, onLogout }) => {
  const [branding, setBranding] = useState(null);
  useEffect(() => {
    if (user.role === "SUPER_ADMIN") return undefined;
    let active = true;
    api.get("/organizations/branding").then(response => { if (active) setBranding(response.data); }).catch(error => console.error("Unable to load organization branding:", error.message));
    return () => { active = false; };
  }, [user.role, user.organizationId]);

  useEffect(() => {
    const root = document.documentElement;
    if (user.role === "SUPER_ADMIN" || !branding) {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--sidebar");
      root.style.removeProperty("--background");
      root.style.removeProperty("--font-family");
    } else {
      root.style.setProperty("--primary", branding.brand_primary_color || DEFAULT_BRANDING.brand_primary_color);
      root.style.setProperty("--sidebar", branding.brand_sidebar_color || DEFAULT_BRANDING.brand_sidebar_color);
      root.style.setProperty("--background", branding.brand_background_color || DEFAULT_BRANDING.brand_background_color);
      root.style.setProperty("--font-family", `'${branding.brand_font || DEFAULT_BRANDING.brand_font}', sans-serif`);
    }
    return () => {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--sidebar");
      root.style.removeProperty("--background");
      root.style.removeProperty("--font-family");
    };
  }, [user.role, branding]);

  const roleLabels = {
    SUPER_ADMIN: "SUPER ADMIN",
    ORG_ADMIN: "ORGANIZATION ADMIN",
    HR: "HUMAN RESOURCES",
    MANAGER: "DEPARTMENT MANAGER",
    EMPLOYEE: "EMPLOYEE",
    RECRUITER: "RECRUITER"
  };
  const menus = {
    SUPER_ADMIN: [["/dashboard", "Platform dashboard"], ["/organizations", "Organizations"], ["/subscriptions", "Plans & subscriptions"]],
    ORG_ADMIN: [["/dashboard", "Dashboard"], ["/subscription", "Subscription & usage"], ["/branding", "Organization branding"], ["/users", "Users & roles"], ["/departments", "Departments"], ["/designations", "Designations"], ["/employees", "Employees"], ["/onboarding", "Onboarding"], ["/assets", "Assets"], ["/attendance", "Attendance"], ["/recruitment", "Recruitment / ATS"], ["/interviews", "Interviews"], ["/leave-approvals", "Leave approvals"], ["/exits", "Exit management"], ["/payroll", "Payroll"], ["/reports", "Reports"], ["/support", "HR Help"]],
    HR: [["/dashboard", "Dashboard"], ["/users", "Users & roles"], ["/departments", "Departments"], ["/designations", "Designations"], ["/employees", "Employees"], ["/onboarding", "Onboarding"], ["/assets", "Assets"], ["/attendance", "Attendance"], ["/recruitment", "Recruitment / ATS"], ["/interviews", "Interviews"], ["/leave-approvals", "Leave approvals"], ["/exits", "Exit management"], ["/payroll", "Payroll"], ["/reports", "Reports"], ["/support", "HR Help"]],
    MANAGER: [["/dashboard", "Team dashboard"], ["/employees", "My team"], ["/departments", "My department"], ["/onboarding", "Team onboarding"], ["/assets", "Team assets"], ["/attendance", "Team attendance"], ["/recruitment", "Hiring requests"], ["/interviews", "Interviews"], ["/leave-approvals", "Leave approvals"], ["/exits", "Exit approvals"], ["/support", "HR Help"]],
    EMPLOYEE: [["/dashboard", "My dashboard"], ["/profile", "My profile"], ["/my-attendance", "My attendance"], ["/my-leaves", "My leave"], ["/onboarding", "My onboarding"], ["/assets", "My assets"], ["/my-exit", "My exit request"], ["/payroll", "My payslips"], ["/support", "HR Help"]],
    RECRUITER: [["/dashboard", "Dashboard"], ["/recruitment", "Recruitment / ATS"], ["/interviews", "Interviews"]]
  };
  const menu = menus[user.role] || menus.EMPLOYEE;

  return (
    <div className="portal">
      <aside className="sidebar">
        <div className="sidebar-brand">
          {user.role === "SUPER_ADMIN" ? <img className="brand-logo-image sidebar-brand-logo" src="/whatsoft-logo.png" alt="Whatsoft" /> : branding?.brand_show_logo ? <img className="brand-logo-image sidebar-brand-logo" src={branding?.brand_logo_data || "/whatsoft-logo.png"} alt={branding?.name || user.organizationName || "Organization"} /> : <strong className="sidebar-organization-name">{branding?.name || user.organizationName || "Organization"}</strong>}
        </div>
        <nav className="portal-nav">{menu.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}</nav>
        <button className="logout-button" onClick={onLogout}>Logout</button>
      </aside>
      <main className="portal-main">
        <header className="top-header"><div className="top-header-identity"><strong>{user.fullName}</strong><small>{roleLabels[user.role] || user.role}</small></div><NotificationBell /><div className="user-avatar" aria-label={`${user.fullName} profile`}>{user.fullName.charAt(0)}</div></header>
        <section className="main-content">
          <Routes>
            <Route path="/dashboard" element={<Dashboard user={user} />} />
            <Route path="/employees" element={["ORG_ADMIN", "HR"].includes(user.role) ? <Employees /> : user.role === "MANAGER" ? <Employees canManage={false} /> : <Navigate to="/dashboard" replace />} />
            <Route path="/departments" element={["ORG_ADMIN", "HR"].includes(user.role) ? <Departments /> : user.role === "MANAGER" ? <Departments canManage={false} /> : <Navigate to="/dashboard" replace />} />
            <Route path="/organizations" element={user.role === "SUPER_ADMIN" ? <Organizations /> : <Navigate to="/dashboard" replace />} />
            <Route path="/subscriptions" element={user.role === "SUPER_ADMIN" ? <SubscriptionsPage /> : <Navigate to="/dashboard" replace />} />
            <Route path="/subscription" element={user.role === "ORG_ADMIN" ? <OrganizationSubscriptionPage /> : <Navigate to="/dashboard" replace />} />
            <Route path="/branding" element={user.role === "ORG_ADMIN" ? <OrganizationBrandingPage branding={branding} onBrandingChange={setBranding} /> : <Navigate to="/dashboard" replace />} />
            <Route path="/users" element={["ORG_ADMIN", "HR"].includes(user.role) ? <UserManagement /> : <Navigate to="/dashboard" replace />} />
            <Route path="/leave-approvals" element={["MANAGER", "HR", "ORG_ADMIN"].includes(user.role) ? <LeaveApprovals /> : <Navigate to="/dashboard" replace />} />
            <Route path="/my-leaves" element={user.role === "EMPLOYEE" ? <MyLeavePage /> : <Navigate to="/dashboard" replace />} />
            <Route path="/my-attendance" element={user.role === "EMPLOYEE" ? <MyAttendance /> : <Navigate to="/dashboard" replace />} />
            <Route path="/profile" element={user.role === "EMPLOYEE" ? <MyProfile /> : <Navigate to="/dashboard" replace />} />
            <Route path="/designations" element={["ORG_ADMIN", "HR"].includes(user.role) ? <DesignationsPage /> : <Navigate to="/dashboard" replace />} />
            <Route path="/onboarding" element={["ORG_ADMIN", "HR", "MANAGER", "EMPLOYEE"].includes(user.role) ? <OnboardingPage role={user.role} /> : <Navigate to="/dashboard" replace />} />
            <Route path="/assets" element={["ORG_ADMIN", "HR", "MANAGER", "EMPLOYEE"].includes(user.role) ? <AssetsPage role={user.role} /> : <Navigate to="/dashboard" replace />} />
            <Route path="/exits" element={["ORG_ADMIN", "HR", "MANAGER"].includes(user.role) ? <ExitPage role={user.role} /> : <Navigate to="/dashboard" replace />} />
            <Route path="/my-exit" element={user.role === "EMPLOYEE" ? <ExitPage role={user.role} /> : <Navigate to="/dashboard" replace />} />
            <Route path="/payroll" element={["ORG_ADMIN", "HR", "EMPLOYEE"].includes(user.role) ? <PayrollPage role={user.role} /> : <Navigate to="/dashboard" replace />} />
            <Route path="/interviews" element={["ORG_ADMIN", "HR", "MANAGER", "RECRUITER"].includes(user.role) ? <InterviewsPage /> : <Navigate to="/dashboard" replace />} />
            <Route path="/reports" element={["ORG_ADMIN", "HR"].includes(user.role) ? <ReportsPage /> : <Navigate to="/dashboard" replace />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/attendance" element={["ORG_ADMIN", "HR"].includes(user.role) ? <Attendance /> : user.role === "MANAGER" ? <Attendance canRecord={false} /> : <Navigate to="/dashboard" replace />} />
            <Route path="/recruitment" element={["ORG_ADMIN", "HR", "MANAGER", "RECRUITER"].includes(user.role) ? <Recruitment user={user} /> : <Navigate to="/dashboard" replace />} />
            <Route path="/support" element={<Support user={user} />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </section>
        <WhatsAppHelpButton />
      </main>
    </div>
  );
};
const WhatsAppHelpButton = () => {
  const openWhatsApp = () => {
    const phone =
      import.meta.env
        .VITE_COMPANY_WHATSAPP_NUMBER ||
      "918341024771";

    const message =
      "Hello HR Team, I need help with my HRMS account.";

    const url =
      `https://wa.me/${phone}` +
      `?text=${encodeURIComponent(message)}`;

    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );
  };

  return (
    <button
      className="whatsapp-help-button"
      onClick={openWhatsApp}
      type="button"
    >
      <span>WhatsApp HR Help</span>
    </button>
  );
};

const App = () => {
  const [
    user,
    setUser
  ] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("hrms_user"));
    } catch {
      return null;
    }
  });

  const login = ({ token, user: signedInUser }) => {
    localStorage.setItem("hrms_token", token);
    localStorage.setItem("hrms_user", JSON.stringify(signedInUser));
    setUser(signedInUser);
  };

  const logout = () => {
    localStorage.removeItem("hrms_token");
    localStorage.removeItem("hrms_user");
    setUser(null);
  };

  return user ? (
    <Portal
      user={user}
      onLogout={logout}
    />
  ) : (
    <Routes>
      <Route path="/accept-invite" element={<AcceptOrganizationInvite />} />
      <Route
        path="*"
        element={
          <Login onLogin={login} />
        }
      />
    </Routes>
  );
};

export default App;
