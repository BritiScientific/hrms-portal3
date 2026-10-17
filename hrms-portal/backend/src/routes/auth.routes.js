const router = require("express").Router();

const {
  getSetupStatus,
  setupFirstUser,
  login,
  previewOrganizationAdminInvitation,
  acceptOrganizationAdminInvitation
} = require("../controllers/auth.controller");

router.get(
  "/setup-status",
  getSetupStatus
);

router.post(
  "/setup-first-user",
  setupFirstUser
);

router.post(
  "/login",
  login
);

router.post(
  "/organization-admin-invitations/preview",
  previewOrganizationAdminInvitation
);

router.post(
  "/organization-admin-invitations/accept",
  acceptOrganizationAdminInvitation
);

module.exports = router;
