const router = require("express").Router();
const multer = require("multer");

const {
  authenticate
} = require("../middleware/auth.middleware");

const {
  allowRoles
} = require("../middleware/role.middleware");

const {
  getEmployees,
  createEmployee,
  getMyEmployee,
  importEmployees
} = require("../controllers/employee.controller");

const uploadEmployeeSheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = file.originalname.toLowerCase().split(".").pop();
    if (!["xlsx", "csv"].includes(extension)) {
      return callback(new Error("Only .xlsx and .csv employee sheets are supported."));
    }
    return callback(null, true);
  }
}).single("file");

const handleEmployeeSheetUpload = (req, res, next) => {
  uploadEmployeeSheet(req, res, error => {
    if (!error) return next();
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Employee sheets must be 5 MB or smaller."
      : error.message || "Unable to upload employee sheet.";
    return res.status(400).json({ message });
  });
};

router.get(
  "/me",
  authenticate,
  allowRoles("EMPLOYEE"),
  getMyEmployee
);

router.get(
  "/",
  authenticate,
  allowRoles("SUPER_ADMIN", "ORG_ADMIN", "HR", "MANAGER"),
  getEmployees
);

router.post(
  "/",
  authenticate,
  allowRoles(
    "SUPER_ADMIN",
    "ORG_ADMIN",
    "HR"
  ),
  createEmployee
);

router.post(
  "/import",
  authenticate,
  allowRoles("ORG_ADMIN", "HR"),
  handleEmployeeSheetUpload,
  importEmployees
);

module.exports = router;
