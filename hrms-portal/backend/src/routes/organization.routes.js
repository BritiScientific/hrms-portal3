const router = require("express").Router();

const {
  authenticate
} = require("../middleware/auth.middleware");

const {
  allowRoles
} = require("../middleware/role.middleware");

const {
  getOrganizations,
  createOrganization,
  updateOrganizationStatus,
  deleteOrganization,
  createOrganizationAdmin,
  getOrganizationBranding,
  updateOrganizationBranding
} = require("../controllers/organization.controller");

router.get(
  "/branding",
  authenticate,
  allowRoles("ORG_ADMIN", "HR", "MANAGER", "EMPLOYEE", "RECRUITER"),
  getOrganizationBranding
);

router.patch(
  "/branding",
  authenticate,
  allowRoles("ORG_ADMIN"),
  updateOrganizationBranding
);

router.get(
  "/",
  authenticate,
  allowRoles("SUPER_ADMIN"),
  getOrganizations
);

router.post(
  "/",
  authenticate,
  allowRoles("SUPER_ADMIN"),
  createOrganization
);

router.patch(
  "/:id/status",
  authenticate,
  allowRoles("SUPER_ADMIN"),
  updateOrganizationStatus
);

router.delete(
  "/:id",
  authenticate,
  allowRoles("SUPER_ADMIN"),
  deleteOrganization
);

router.post(
  "/admin",
  authenticate,
  allowRoles("SUPER_ADMIN"),
  createOrganizationAdmin
);

module.exports = router;
