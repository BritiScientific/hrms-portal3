const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");
const { getPayroll, getMyPayroll, createPayroll, markPaid } = require("../controllers/payroll.controller");

router.get("/mine", authenticate, allowRoles("EMPLOYEE"), getMyPayroll);
router.get("/", authenticate, allowRoles("ORG_ADMIN", "HR"), getPayroll);
router.post("/", authenticate, allowRoles("ORG_ADMIN", "HR"), createPayroll);
router.patch("/:id/paid", authenticate, allowRoles("ORG_ADMIN", "HR"), markPaid);
module.exports = router;
