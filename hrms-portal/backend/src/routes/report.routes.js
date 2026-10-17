const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");
const { getSummary } = require("../controllers/report.controller");

router.get("/summary", authenticate, allowRoles("ORG_ADMIN", "HR"), getSummary);
module.exports = router;
