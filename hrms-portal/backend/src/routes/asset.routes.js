const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");
const { getAssets, getMyAssets, createAsset, assignAsset, returnAsset } = require("../controllers/asset.controller");

router.get("/mine", authenticate, allowRoles("EMPLOYEE"), getMyAssets);
router.get("/", authenticate, allowRoles("ORG_ADMIN", "HR", "MANAGER"), getAssets);
router.post("/", authenticate, allowRoles("ORG_ADMIN", "HR"), createAsset);
router.post("/:id/assign", authenticate, allowRoles("ORG_ADMIN", "HR"), assignAsset);
router.post("/:id/return", authenticate, allowRoles("ORG_ADMIN", "HR"), returnAsset);
module.exports = router;
