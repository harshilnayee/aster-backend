const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { verifyToken, loginLimiter, registerLimiter } = require("../middleware/auth");

// POST /api/auth/login
router.post("/login", loginLimiter, authController.login);

// POST /api/auth/register
router.post("/register", registerLimiter, authController.register);

// GET /api/auth/me (requires verification)
router.get("/me", verifyToken, authController.getMe);

module.exports = router;
