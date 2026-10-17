const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");
const { getInterviews, createInterview, updateInterview } = require("../controllers/interview.controller");

router.get("/", authenticate, allowRoles("ORG_ADMIN", "HR", "MANAGER", "RECRUITER"), getInterviews);
router.post("/", authenticate, allowRoles("ORG_ADMIN", "HR", "MANAGER", "RECRUITER"), createInterview);
router.patch("/:id", authenticate, allowRoles("ORG_ADMIN", "HR", "MANAGER", "RECRUITER"), updateInterview);
module.exports = router;
