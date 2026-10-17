# Whatsoft HRMS Portal

## Start the portal

From the repository root, start both the API and frontend with one command:

```powershell
npm.cmd run dev
```

The frontend opens at `http://localhost:5173` and the API listens on
`http://localhost:5001`. Press Ctrl+C to stop both. PostgreSQL must be running,
and `backend/.env` must be configured before login and data features can work.

## PostgreSQL setup

Configure `backend/.env` with the PostgreSQL host, database, username, and password. Create the database first, then apply `backend/database/schema.sql` once:

```powershell
psql -h localhost -U hrms_user -d hrms_portal -f backend/database/schema.sql
```

The SQL uses additive table/column creation and can be run again to add newer schema changes.

## Subscription setup

After updating the project, apply the latest `backend/database/schema.sql`. Existing organizations are assigned a system-managed unlimited legacy plan so the update does not block their current work. New organizations can have their admin account created first, then the Super Admin should create a plan and assign it before the organization adds employees, users, departments, or candidates.

In the Super Admin portal, open **Plans & subscriptions** to create a plan and assign or renew it for an organization. Blank usage limits mean unlimited. The plan limits active employee records, active login accounts, departments, and candidates created during that subscription term. Organization Admins can see their current plan and remaining usage under **Subscription & usage**.

Organization Admins can open **Organization branding** to choose the workspace, sidebar, and page-background colors and font, upload or remove an organization logo, or hide the logo. Branding applies to signed-in users in that organization. The Super Admin portal keeps the small Whatsoft logo and its platform theme. Logo uploads accept PNG, JPEG, WebP, or GIF files up to 200 KB.

HR and Organization Admins can import employee records from the **Employees** page using an `.xlsx` or `.csv` sheet (maximum 5 MB and 5,000 rows). Download the page's CSV template for the supported columns. Employee Code and First Name are required; optional department and designation names must already exist in the organization. Matching Employee Codes update existing records, and new codes create records. Blank optional cells clear existing optional values. Each import is validated before it is saved, so invalid rows or plan-capacity limits prevent partial imports. The **Export employees (CSV)** button downloads the records currently visible to the signed-in user.

The portal records the plan price and dates but does not collect payment. Connect a payment provider before using it to charge customers.

## First login and role setup

1. Before first launch, set `SUPER_ADMIN_BOOTSTRAP_KEY` in the backend environment to a random secret with at least 32 characters. Generate one locally with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`; put it in the hosting provider's secret settings or `backend/.env`, never in frontend variables or source control.
2. Open the login page and choose **Initial Super Admin setup**. Enter the key, Super Admin name, email, and password. Setup is serialized in PostgreSQL and closes as soon as a Super Admin exists. Remove `SUPER_ADMIN_BOOTSTRAP_KEY` from the backend environment and restart/redeploy the backend immediately afterward.
3. Sign in as Super Admin, create an organization, and create an Organization Admin invitation. The portal displays the one-time invite link; copy it and send it only to the named admin over a trusted channel. Links expire after 48 hours, and creating another invitation for the same organization and email revokes the previous one. The project does not yet send invitation emails.
4. The invited admin opens the link, chooses their own password, and then signs in through the regular login page.
5. Sign in as Organization Admin. Create departments and employee records, then open **Users & role access** to create HR, Department Manager, Employee, or Recruiter accounts.
6. Assign each manager to a department. Link each employee login to its employee record. All accounts use the same login page; the account role selects its portal and permissions.

For an existing database, apply the migrations in order: `backend/database/migrations/002_organization_admin_invitations.sql` and `backend/database/migrations/003_organization_background_color.sql`. For a new database, `backend/database/schema.sql` includes both changes. Do not drop or recreate the database to apply migrations.

## Deployment environment

Use `backend/.env.example` as a variable-name reference; do not commit `.env` or real secrets. Set the database variables, a long random `JWT_SECRET`, `NODE_ENV=production`, `FRONTEND_URL` (the deployed frontend origin, using HTTPS), and `CORS_ORIGIN` (the exact frontend origin) in the backend host's secret settings. Set `VITE_API_BASE_URL` on the frontend build to the deployed API base, such as `https://api.example.com/api/v1`. Never put database credentials, JWT secrets, or the bootstrap key in `VITE_*` variables because those are shipped to browsers.

This repository has a Vite frontend and a separate Express API, and both need to be deployed along with a reachable PostgreSQL database. A static frontend host alone does not run the API. GoDaddy/Hostinger plans vary, so verify that the specific plan supports the required Node.js app and outbound PostgreSQL connections.

Netlify is configured by the repository-root `netlify.toml` to build `hrms-portal/frontend`, publish its `dist` directory, and use the frontend's SPA rewrite for routes such as `/accept-invite`. Deploy the Express backend separately to a Node.js host and PostgreSQL to a reachable database. In Netlify's frontend environment-variable settings, set `VITE_API_BASE_URL` to the deployed backend URL ending in `/api/v1` (for example, `https://your-api-host.example.com/api/v1`), then trigger a new frontend deploy. On the backend host set `CORS_ORIGIN` and `FRONTEND_URL` to your exact HTTPS Netlify site origin and configure the PostgreSQL credentials and `JWT_SECRET`. `VITE_API_BASE_URL` is embedded into the frontend at build time; changing it requires a new frontend deploy. Do not put backend secrets in Netlify frontend variables.

The API health check is `https://your-api-host.example.com/api/v1/health`. It should return HTTP 200 with `"status":"ok"` and `"database":"connected"` before the frontend login and data features can work. Vercel supports Express deployments, but this Express server is not configured as a Vercel function; it also needs an appropriate serverless adapter and routing setup.

## Role workflows in this build

- **Super Admin:** organization creation and organization admin provisioning, plan creation, subscription assignment, and organization usage overview. Sign in through the Super Admin portal to manage platform-level settings.
- **Organization Admin:** organization staff, departments/designations, role accounts, onboarding, assets, attendance, recruitment/interviews, leave/exit review, payroll, and reports.
- **HR:** employee and account administration, onboarding, assets, attendance, recruitment/interviews, leave/exit review, payroll, and reports.
- **Department Manager:** department-scoped staff/onboarding/attendance, hiring requests, and leave/exit approvals.
- **Employee:** linked profile, recent attendance, onboarding tasks, assigned assets, leave/exit requests, payslips, and notifications.
- **Recruiter:** job, candidate, and interview management.

All listed web modules use PostgreSQL. Biometric punches update daily attendance when the device user ID matches an employee's biometric ID. Automated syncing with physical biometric devices, document uploads, email delivery, and the separate mobile application still require integration work.
