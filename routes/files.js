const express = require("express");
const router = express.Router();
const multer = require("multer");
const fileController = require("../controllers/fileController");
const { verifyToken } = require("../middleware/auth");

const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/webp", "application/pdf"
];

// Set up memory storage for upload. Limit size to 10MB as defined in index.js limit.
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, WEBP, and PDF files are allowed."));
    }
  }
});

// POST /api/patients/:id/files - Upload file to R2 and link to patient record (Admin, Doctor, Employee)
// router.post(
//   "/:id/files",
//   verifyToken,
//   (req, res, next) => {
//     upload.single("file")(req, res, (err) => {
//       if (err) {
//         return res.status(400).json({ message: err.message });
//       }
//       next();
//     });
//   },
//   fileController.uploadFile
// );

// GET /api/patients/:id/files - Get all files linked to patient record (Admin, Doctor, Employee)
// router.get("/:id/files", verifyToken, fileController.getFiles);

// DELETE /api/patients/:id/files/:fileId - Delete file from record and R2 (Admin, Doctor, Employee)
// router.delete("/:id/files/:fileId", verifyToken, fileController.deleteFile);

module.exports = router;
