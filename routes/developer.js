const express = require("express");
const router = express.Router();
const developerController = require("../controllers/developerController");
const { verifyToken, requireRole } = require("../middleware/auth");

// Public/Authenticated banner endpoint (accessible to all logged-in doctors/staff)
router.get("/announcement", verifyToken, developerController.getAnnouncement);

// All other developer endpoints require superadmin role
router.use(verifyToken, requireRole("superadmin"));

router.get("/stats", developerController.getSystemStats);
router.get("/audit-logs", developerController.getAuditLogs);

// Clinic management — superadmin only
router.get("/clinics", developerController.getClinics);
router.post("/clinics", developerController.createClinic);
router.patch("/clinics/:clinicId/subscription", developerController.updateClinicSubscription);
router.patch("/clinics/:clinicId/status", developerController.toggleClinicStatus);

// User & Account Controls — superadmin only
router.get("/users", developerController.getUsersList);
router.patch("/users/:userId/status", developerController.toggleUserStatus);
router.post("/users/:userId/reset-password", developerController.resetUserPassword);

// IP & Device Session Management — superadmin only
router.get("/sessions", developerController.getActiveSessions);
router.delete("/sessions/:sessionId", developerController.revokeSession);
router.delete("/sessions/user/:userId", developerController.revokeUserSessions);
router.post("/purge-all-sessions", developerController.purgeAllGlobalSessions);

// Form Usage & Platform Analytics — superadmin only
router.get("/form-analytics", developerController.getFormAnalytics);

// Platform Global Banner Announcement update — superadmin only
router.post("/announcement", developerController.updateAnnouncement);

// DB Integrity Sanity Inspector & Export Diagnostics — superadmin only
router.post("/sanity-check", developerController.runDatabaseSanityCheck);
router.get("/export-diagnostics", developerController.exportSystemDiagnostics);

// Environment Health, Gateway Tester & Collection Stats — superadmin only
router.get("/env-health", developerController.getEnvHealth);
router.post("/test-notification", developerController.testNotification);
router.get("/collection-stats", developerController.getCollectionStats);

module.exports = router;
