const jwt = require("jsonwebtoken");
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

    req.user = user;
    next();
  } catch (error) {
    console.error("Token verification error:", error.message);
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token has expired" });
    }
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

    // Admins and Doctors always bypass form restrictions
    if (req.user.role === "admin" || req.user.role === "doctor") {
      return next();
    }

    const formType = req.params[formTypeParamName];
    if (!formType) {
      return res.status(400).json({ message: "Form type parameter is required" });
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

module.exports = {
  verifyToken,
  requireRole,
  checkFormAccess
};
