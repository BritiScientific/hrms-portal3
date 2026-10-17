const authRoutes = require("./routes/auth.routes");
const employeeRoutes = require("./routes/employee.routes");
const departmentRoutes = require("./routes/department.routes");
const attendanceRoutes = require("./routes/attendance.routes");
const recruitmentRoutes = require("./routes/recruitment.routes");
const organizationRoutes = require("./routes/organization.routes");
const whatsappRoutes = require("./routes/whatsapp.routes");
const userRoutes = require("./routes/user.routes");
const leaveRoutes = require("./routes/leave.routes");
const onboardingRoutes = require("./routes/onboarding.routes");
const assetRoutes = require("./routes/asset.routes");
const exitRoutes = require("./routes/exit.routes");
const payrollRoutes = require("./routes/payroll.routes");
const interviewRoutes = require("./routes/interview.routes");
const reportRoutes = require("./routes/report.routes");
const notificationRoutes = require("./routes/notification.routes");
const designationRoutes = require("./routes/designation.routes");
const subscriptionRoutes = require("./routes/subscription.routes");
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const pool = require("./config/db");

const app = express();

const configuredCorsOrigins = [process.env.CORS_ORIGIN, process.env.CORS_ORIGINS]
  .filter(Boolean)
  .flatMap(origins => origins.split(","))
  .map(origin => origin.trim())
  .filter(Boolean);
const localCorsOrigins = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"];
const corsOrigins = process.env.NODE_ENV === "production"
  ? configuredCorsOrigins
  : [...new Set([...configuredCorsOrigins, ...localCorsOrigins])];

if (process.env.NODE_ENV === "production" && !corsOrigins.length) {
  throw new Error("CORS_ORIGIN or CORS_ORIGINS must include the deployed frontend origin in production");
}

app.use(
  cors({
    origin: corsOrigins
  })
);

app.use(express.json({ limit: "400kb" }));

app.get("/", (req, res) => {
  res.json({
    message: "Backend is running"
  });
});

app.get("/api/v1/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json({
      status: "ok",
      message: "HRMS API is running",
      database: "connected"
    });
  } catch (error) {
    console.error("Health check database error:", error.message);
    return res.status(503).json({
      status: "unavailable",
      message: "HRMS API cannot reach PostgreSQL",
      database: "disconnected"
    });
  }
});

const port = Number(process.env.PORT || 5001);
app.use(
  "/api/v1/auth",
  authRoutes
);

app.use("/api/v1/employees", employeeRoutes);
app.use("/api/v1/departments", departmentRoutes);
app.use("/api/v1/attendance", attendanceRoutes);
app.use("/api/v1/recruitment", recruitmentRoutes);
app.use("/api/v1/organizations", organizationRoutes);
app.use("/api/v1/whatsapp", whatsappRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/leaves", leaveRoutes);
app.use("/api/v1/onboarding", onboardingRoutes);
app.use("/api/v1/assets", assetRoutes);
app.use("/api/v1/exits", exitRoutes);
app.use("/api/v1/payroll", payrollRoutes);
app.use("/api/v1/interviews", interviewRoutes);
app.use("/api/v1/reports", reportRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/designations", designationRoutes);
app.use("/api/v1/subscriptions", subscriptionRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "API route not found" });
});
app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`);
});
