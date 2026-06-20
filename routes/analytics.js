const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analyticsController");
const { verifyToken, requireRole } = require("../middleware/auth");

// All analytics routes require auth and are restricted to Admin and Doctor
router.use(verifyToken, requireRole("admin", "doctor"));

// GET /api/analytics/summary
router.get("/summary", analyticsController.getSummary);

// GET /api/analytics/companies
router.get("/companies", analyticsController.getCompanies);

module.exports = router;
