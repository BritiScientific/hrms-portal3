const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");
const { getMyLeaves, createMyLeave, getReviewQueue, reviewLeave } = require("../controllers/leave.controller");

router.get("/mine", authenticate, allowRoles("EMPLOYEE"), getMyLeaves);
router.post("/mine", authenticate, allowRoles("EMPLOYEE"), createMyLeave);
router.get("/requests", authenticate, allowRoles("MANAGER", "HR", "ORG_ADMIN"), getReviewQueue);
router.patch("/requests/:id/review", authenticate, allowRoles("MANAGER", "HR", "ORG_ADMIN"), reviewLeave);

module.exports = router;
