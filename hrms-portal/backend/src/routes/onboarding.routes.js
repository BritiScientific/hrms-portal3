const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");
const { getTasks, getMyTasks, createTask, updateTask } = require("../controllers/onboarding.controller");

router.get("/mine", authenticate, allowRoles("EMPLOYEE"), getMyTasks);
router.get("/", authenticate, allowRoles("ORG_ADMIN", "HR", "MANAGER"), getTasks);
router.post("/", authenticate, allowRoles("ORG_ADMIN", "HR"), createTask);
router.patch("/:id", authenticate, allowRoles("ORG_ADMIN", "HR", "MANAGER", "EMPLOYEE"), updateTask);
module.exports = router;
