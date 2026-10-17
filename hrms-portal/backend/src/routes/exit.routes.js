const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");
const { getMyExits, createExit, getExits, reviewExit } = require("../controllers/exit.controller");

router.get("/mine", authenticate, allowRoles("EMPLOYEE"), getMyExits);
router.post("/mine", authenticate, allowRoles("EMPLOYEE"), createExit);
router.get("/", authenticate, allowRoles("ORG_ADMIN", "HR", "MANAGER"), getExits);
router.patch("/:id/review", authenticate, allowRoles("ORG_ADMIN", "HR", "MANAGER"), reviewExit);
module.exports = router;
