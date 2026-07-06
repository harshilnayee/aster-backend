const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { verifyToken } = require("../middleware/auth");

// POST /api/auth/login
router.post("/login", authController.login);

// GET /api/auth/me (requires verification)
router.get("/me", verifyToken, authController.getMe);

module.exports = router;
