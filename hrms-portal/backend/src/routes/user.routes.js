const router = require("express").Router();
const multer = require("multer");
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");
const { getUsers, createUser, updateMyProfilePicture } = require("../controllers/user.controller");

const uploadProfilePicture = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return callback(new Error("Only PNG, JPEG, and WebP profile pictures are supported."));
    }
    return callback(null, true);
  }
}).single("profilePicture");

const handleProfilePictureUpload = (req, res, next) => {
  uploadProfilePicture(req, res, error => {
    if (!error) return next();
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Profile pictures must be 2 MB or smaller."
      : error.message || "Unable to upload profile picture.";
    return res.status(400).json({ message });
  });
};

router.post(
  "/me/profile-picture",
  authenticate,
  handleProfilePictureUpload,
  updateMyProfilePicture
);

router.use(authenticate, allowRoles("ORG_ADMIN", "HR"));
router.get("/", getUsers);
router.post("/", createUser);

module.exports = router;
