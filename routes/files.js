const express = require("express");
const router = express.Router();
const multer = require("multer");
const fileController = require("../controllers/fileController");
const { verifyToken } = require("../middleware/auth");

// Set up memory storage for upload. Limit size to 10MB as defined in index.js limit.
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// POST /api/patients/:id/files - Upload file to R2 and link to patient record (Admin, Doctor, Employee)
router.post("/:id/files", verifyToken, upload.single("file"), fileController.uploadFile);

// GET /api/patients/:id/files - Get all files linked to patient record (Admin, Doctor, Employee)
router.get("/:id/files", verifyToken, fileController.getFiles);

// DELETE /api/patients/:id/files/:fileId - Delete file from record and R2 (Admin, Doctor, Employee)
router.delete("/:id/files/:fileId", verifyToken, fileController.deleteFile);

module.exports = router;
