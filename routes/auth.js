const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { verifyToken, loginLimiter } = require("../middleware/auth");

// POST /api/auth/login
router.post("/login", loginLimiter, authController.login);

// GET /api/auth/me (requires verification)
router.get("/me", verifyToken, authController.getMe);

module.exports = router;
