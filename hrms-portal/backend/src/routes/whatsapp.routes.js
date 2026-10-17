const router = require("express").Router();

const {
  authenticate
} = require("../middleware/auth.middleware");

const {
  createWhatsAppHelpLink
} = require("../controllers/whatsapp.controller");

router.get(
  "/help-link",
  authenticate,
  createWhatsAppHelpLink
);

module.exports = router;