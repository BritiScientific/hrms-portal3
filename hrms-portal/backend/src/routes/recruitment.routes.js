const router = require("express").Router();

const {
  authenticate
} = require("../middleware/auth.middleware");

const {
  allowRoles
} = require("../middleware/role.middleware");

const {
  getManpowerRequests,
  createManpowerRequest,
  getJobs,
  createJob,
  getCandidates,
  createCandidate,
  updateCandidateStage
} = require("../controllers/recruitment.controller");

router.get(
  "/manpower-requests",
  authenticate,
  allowRoles("SUPER_ADMIN", "ORG_ADMIN", "HR", "MANAGER", "RECRUITER"),
  getManpowerRequests
);

router.post(
  "/manpower-requests",
  authenticate,
  allowRoles(
    "MANAGER",
    "HR",
    "ORG_ADMIN"
  ),
  createManpowerRequest
);

router.get(
  "/jobs",
  authenticate,
  allowRoles("SUPER_ADMIN", "ORG_ADMIN", "HR", "RECRUITER", "MANAGER"),
  getJobs
);

router.post(
  "/jobs",
  authenticate,
  allowRoles(
    "HR",
    "RECRUITER",
    "ORG_ADMIN"
  ),
  createJob
);

router.get(
  "/candidates",
  authenticate,
  allowRoles("SUPER_ADMIN", "ORG_ADMIN", "HR", "RECRUITER", "MANAGER"),
  getCandidates
);

router.post(
  "/candidates",
  authenticate,
  allowRoles(
    "HR",
    "RECRUITER",
    "ORG_ADMIN"
  ),
  createCandidate
);

router.patch(
  "/candidates/:id",
  authenticate,
  allowRoles(
    "HR",
    "RECRUITER",
    "MANAGER",
    "ORG_ADMIN"
  ),
  updateCandidateStage
);

module.exports = router;
