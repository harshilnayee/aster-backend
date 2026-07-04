const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { verifyToken } = require("../middleware/auth");
const rateLimit = require("express-rate-limit");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8, // only 8 login attempts per IP per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in 15 minutes." }
});

// POST /api/auth/login
router.post("/login", loginLimiter, authController.login);

// GET /api/auth/me (requires verification)
router.get("/me", verifyToken, authController.getMe);

module.exports = router;
