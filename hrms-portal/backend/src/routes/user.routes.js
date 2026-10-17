const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");
const { getUsers, createUser } = require("../controllers/user.controller");

router.use(authenticate, allowRoles("ORG_ADMIN", "HR"));
router.get("/", getUsers);
router.post("/", createUser);

module.exports = router;
