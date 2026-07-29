const express = require("express");
const router = express.Router();
const developerController = require("../controllers/developerController");
const { verifyToken, requireRole } = require("../middleware/auth");

router.use(verifyToken, requireRole("superadmin"));

router.get("/stats", developerController.getSystemStats);
router.get("/audit-logs", developerController.getAuditLogs);

// Clinic management — superadmin only
router.get("/clinics", developerController.getClinics);
router.post("/clinics", developerController.createClinic);

module.exports = router;
