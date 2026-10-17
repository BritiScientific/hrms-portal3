const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { getNotifications, markRead } = require("../controllers/notification.controller");

router.get("/", authenticate, getNotifications);
router.patch("/:id/read", authenticate, markRead);
module.exports = router;
