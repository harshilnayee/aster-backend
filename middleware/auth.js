const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authorization token is missing or invalid" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Authorization token is empty" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: "User not found associated with token" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "User account has been deactivated" });
    }

    // Check session validity if token carries a sessionId
    if (decoded.sessionId && Array.isArray(user.activeSessions) && user.activeSessions.length > 0) {
      const activeSess = user.activeSessions.find((s) => s.sessionId === decoded.sessionId);
      if (!activeSess) {
        return res.status(401).json({ message: "Session or IP address revoked by developer. Please log in again." });
      }
    }

    req.user = user;
    // Attach clinicId from the JWT (already validated above) for tenant scoping
    if (!req.user.clinicId && decoded.clinicId) {
      req.user.clinicId = decoded.clinicId;
    }
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token has expired" });
    }
    if (error.name === "JsonWebTokenError" || error.name === "NotBeforeError") {
      return res.status(401).json({ message: "Invalid authorization token" });
    }
    if (error.name?.includes("Mongo") || error.message?.includes("connection") || error.message?.includes("topology") || error.message?.includes("timed out")) {
      console.error("Database connection error during authentication check:", error.message);
      return res.status(503).json({ message: "Database connection error. Retrying connection..." });
    }
    console.error("Token verification error:", error.message);
    return res.status(401).json({ message: "Invalid authorization token" });
  }
};

// Middleware to restrict access to specific roles
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Requires one of the following roles: ${roles.join(", ")}`
      });
    }

    next();
  };
};

// Middleware to check if employee user has permission for a specific form type
const checkFormAccess = (formTypeParamName = "formType") => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Superadmin, admins, and doctors always bypass form restrictions
    if (req.user.role === "superadmin" || req.user.role === "admin" || req.user.role === "doctor") {
      return next();
    }

    const formType = req.params[formTypeParamName];
    if (!formType) {
      return res.status(400).json({ message: "Form type parameter is required" });
    }

    if (formType === "prescription") {
      return next();
    }

    // Check if the employee has access to this form
    if (req.user.role === "employee" && req.user.formAccess.includes(formType)) {
      return next();
    }

    return res.status(403).json({
      message: `Access denied. You do not have permission to view or modify form type: ${formType}`
    });
  };
};

/** Returns true if user may access the given form key (admin/doctor always). */
function userHasFormAccess(user, formKey) {
  if (!user) return false;
  if (user.role === "superadmin" || user.role === "admin" || user.role === "doctor") return true;
  if (user.role === "employee") {
    return Array.isArray(user.formAccess) && user.formAccess.includes(formKey);
  }
  return false;
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 15 login requests per windowMs
  message: { message: "Too many login attempts from this IP, please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Bumped from 5 → 10 so legitimate users retrying (typo'd password etc.) aren't blocked
  message: { message: "Too many registration attempts from this IP, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 invite creations per hour per IP
  message: { message: "Too many invite requests from this IP, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware: restrict route to superadmin only
const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required." });
  }
  if (req.user.role !== "superadmin") {
    return res.status(403).json({ message: "Access denied. Superadmin only." });
  }
  next();
};

module.exports = {
  verifyToken,
  requireRole,
  requireSuperAdmin,
  checkFormAccess,
  userHasFormAccess,
  loginLimiter,
  registerLimiter,
  inviteLimiter
};
