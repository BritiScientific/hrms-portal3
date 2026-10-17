const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");
const {
  getPlans,
  createPlan,
  updatePlanStatus,
  getSubscriptions,
  assignSubscription,
  getMySubscription
} = require("../controllers/subscription.controller");

router.get("/current", authenticate, allowRoles("ORG_ADMIN"), getMySubscription);
router.get("/plans", authenticate, allowRoles("SUPER_ADMIN"), getPlans);
router.post("/plans", authenticate, allowRoles("SUPER_ADMIN"), createPlan);
router.patch("/plans/:id/status", authenticate, allowRoles("SUPER_ADMIN"), updatePlanStatus);
router.get("/", authenticate, allowRoles("SUPER_ADMIN"), getSubscriptions);
router.post("/assign", authenticate, allowRoles("SUPER_ADMIN"), assignSubscription);

module.exports = router;
