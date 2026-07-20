const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");

/**
 * Handles user login authentication
 * POST /api/auth/login
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const targetEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: targetEmail }).select("+password");

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Verify hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
    );

    await AuditLog.create({
      userId: user._id,
      userName: user.name,
      userRole: user.role,
      action: "login",
      details: `User logged in from IP ${req.ip || "unknown"}`
    });

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(200).json({
      message: "Login successful",
      token,
      user: userResponse
    });
  } catch (error) {
    console.error("Login controller error:", error);
    next(error);
  }
}

/**
 * Gets details of the currently authenticated user
 * GET /api/auth/me
 */
async function getMe(req, res, next) {
  try {
    // req.user is set by verifyToken middleware
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    return res.status(200).json({
      user: req.user
    });
  } catch (error) {
    console.error("GetMe controller error:", error);
    next(error);
  }
}

module.exports = {
  login,
  getMe
};
