const router = require("express").Router();

const {
  authenticate
} = require("../middleware/auth.middleware");

const {
  allowRoles
} = require("../middleware/role.middleware");

const {
  getDepartments,
  createDepartment,
  deleteDepartment
} = require("../controllers/department.controller");

router.get(
  "/",
  authenticate,
  allowRoles("SUPER_ADMIN", "ORG_ADMIN", "HR", "MANAGER"),
  getDepartments
);

router.post(
  "/",
  authenticate,
  allowRoles(
    "SUPER_ADMIN",
    "ORG_ADMIN",
    "HR"
  ),
  createDepartment
);

router.delete(
  "/:id",
  authenticate,
  allowRoles(
    "SUPER_ADMIN",
    "ORG_ADMIN",
    "HR"
  ),
  deleteDepartment
);

module.exports = router;
