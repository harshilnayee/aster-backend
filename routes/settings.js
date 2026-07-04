const express = require("express");
const router = express.Router();
const settingController = require("../controllers/settingController");
const { verifyToken, requireRole } = require("../middleware/auth");

// GET /api/settings/form-sequence - Get global form sequence
router.get("/form-sequence", verifyToken, settingController.getFormSequence);

// POST /api/settings/form-sequence - Set global form sequence (Admin only)
router.post("/form-sequence", verifyToken, requireRole("admin"), settingController.updateFormSequence);

module.exports = router;
