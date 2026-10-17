const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");
const { getDesignations, createDesignation, deleteDesignation } = require("../controllers/designation.controller");

router.get("/", authenticate, allowRoles("ORG_ADMIN", "HR"), getDesignations);
router.post("/", authenticate, allowRoles("ORG_ADMIN", "HR"), createDesignation);
router.delete("/:id", authenticate, allowRoles("ORG_ADMIN", "HR"), deleteDesignation);
module.exports = router;
