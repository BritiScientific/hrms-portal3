const router = require("express").Router();

const {
  authenticate
} = require("../middleware/auth.middleware");

const {
  allowRoles
} = require("../middleware/role.middleware");

const {
  getAttendance,
  getMyAttendance,
  saveBiometricLog
} = require("../controllers/attendance.controller");

router.get(
  "/mine",
  authenticate,
  allowRoles("EMPLOYEE"),
  getMyAttendance
);

router.get(
  "/",
  authenticate,
  allowRoles("SUPER_ADMIN", "ORG_ADMIN", "HR", "MANAGER"),
  getAttendance
);

router.post(
  "/biometric-log",
  authenticate,
  allowRoles(
    "SUPER_ADMIN",
    "ORG_ADMIN",
    "HR"
  ),
  saveBiometricLog
);

module.exports = router;
