const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");

function getAllFormKeys() {
  const registryPath = path.join(__dirname, "../config/formRegistry.json");
  if (!fs.existsSync(registryPath)) return [];
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  return Object.keys(registry);
}

function parseUserAgent(uaString = "") {
  if (!uaString) return "Desktop Browser";
  let device = "Desktop Browser";
  if (/mobile/i.test(uaString)) device = "Mobile Device";
  if (/tablet|ipad/i.test(uaString)) device = "Tablet";

  let browser = "Browser";
  if (/chrome|crios/i.test(uaString)) browser = "Chrome";
  else if (/firefox|fxios/i.test(uaString)) browser = "Firefox";
  else if (/safari/i.test(uaString)) browser = "Safari";
  else if (/edg/i.test(uaString)) browser = "Edge";

  let os = "";
  if (/windows/i.test(uaString)) os = "Windows";
  else if (/macintosh|mac os/i.test(uaString)) os = "macOS";
  else if (/android/i.test(uaString)) os = "Android";
  else if (/iphone|ipad/i.test(uaString)) os = "iOS";
  else if (/linux/i.test(uaString)) os = "Linux";

  return `${browser} on ${os || device}`;
}

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

    if (!user.isActive) {
      return res.status(403).json({ message: "User account has been deactivated" });
    }

    // Extract IP address & User Agent details
    const rawIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || req.ip || "127.0.0.1";
    const cleanIp = rawIp.replace(/^::ffff:/, "");
    const rawUa = req.headers["user-agent"] || "";
    const deviceType = parseUserAgent(rawUa);
    const sessionId = `sess_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

    // Append to user's active sessions (keep max 15)
    if (!Array.isArray(user.activeSessions)) {
      user.activeSessions = [];
    }
    user.activeSessions.push({
      sessionId,
      ip: cleanIp,
      userAgent: rawUa || "Browser Session",
      deviceType,
      createdAt: new Date(),
      lastActiveAt: new Date()
    });
    if (user.activeSessions.length > 15) {
      user.activeSessions = user.activeSessions.slice(-15);
    }
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role, clinicId: user.clinicId ?? null, sessionId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
    );

    await AuditLog.create({
      userId: user._id,
      userName: user.name,
      userRole: user.role,
      action: "login",
      details: `User logged in from IP ${cleanIp} (${deviceType})`
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

/**
 * Self-service signup for clinic registration
 * POST /api/auth/register
 */
async function register(req, res, next) {
  try {
    const { name, email, password, clinicName, mobile, doctorRegNo, doctorQualification, cityState, monthlyVolume } = req.body;

    if (!name || !email || !password || !clinicName) {
      return res.status(400).json({ message: "Name, email, password, and clinic name are required" });
    }

    const targetEmail = email.toLowerCase().trim();

    // Validate email format
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(targetEmail)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    // Validate password complexity requirements
    if (password.length < 10) {
      return res.status(400).json({ message: "Password must be at least 10 characters long" });
    }
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[^A-Za-z0-9]/.test(password);
    if (!hasUpper || !hasLower || !hasNumber || !hasSymbol) {
      return res.status(400).json({
        message: "Password must include an uppercase letter, lowercase letter, number, and symbol (e.g. ClinicPass@123)"
      });
    }

    const existingUser = await User.findOne({ email: targetEmail });
    if (existingUser) {
      return res.status(400).json({ message: "An account with this email already exists" });
    }

    const Clinic = require("../models/Clinic");
    const Patient = require("../models/Patient");
    const { generatePatientId } = require("../utils/patientId");

    // Generate safe clinic slug
    const baseSlug = clinicName.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 30) || "clinic";
    const slug = `${baseSlug}_${Date.now().toString(36)}`;

    const selectedPlanKey = req.body.plan || "certifying";
    let planName = "Certifying Surgeon Plan";
    let monthlyLimit = 2500;
    if (selectedPlanKey === "starter") {
      planName = "Starter Plan";
      monthlyLimit = 750;
    } else if (selectedPlanKey === "industrial") {
      planName = "Industrial Drive Plan";
      monthlyLimit = 5000;
    }

    // Create Clinic
    const clinic = await Clinic.create({
      slug,
      name: clinicName.trim(),
      doctorName: name.trim(),
      doctorRegNo: (doctorRegNo || "").trim(),
      doctorQualification: (doctorQualification || "").trim(),
      cityState: (cityState || "").trim(),
      monthlyVolume: (monthlyVolume || "").trim(),
      address: cityState ? `${cityState.trim()}, Occupational Health Center` : "Main Occupational Health Center",
      subscription: {
        plan: selectedPlanKey,
        planName,
        monthlyLimit,
        topUpCredits: 0
      }
    });

    // Pass plaintext password — UserSchema pre("save") hashes once.
    // Manual bcrypt + save() would double-hash and break login.
    const user = await User.create({
      name: name.trim(),
      email: targetEmail,
      password,
      role: "admin",
      clinicId: clinic._id,
      isActive: true,
      formAccess: getAllFormKeys()
    });

    // Auto-seed 2 demo patients for instant trial experience
    try {
      const demoId1 = await generatePatientId();
      await Patient.create({
        patientId: demoId1,
        name: "Rajesh Kumar (Sample)",
        age: 34,
        gender: "Male",
        mobile: mobile || "9876543210",
        company: "Sample Industrial Corp",
        department: "Operations",
        clinicId: clinic._id,
        isSample: true,
        createdBy: user._id
      });

      const demoId2 = await generatePatientId();
      await Patient.create({
        patientId: demoId2,
        name: "Priya Sharma (Sample)",
        age: 28,
        gender: "Female",
        mobile: "9876543211",
        company: "Sample Logistics Pvt Ltd",
        department: "Safety & HR",
        clinicId: clinic._id,
        isSample: true,
        createdBy: user._id
      });
    } catch (seedErr) {
      console.warn("Non-fatal demo patient seed warning:", seedErr);
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, clinicId: clinic._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
    );

    await AuditLog.create({
      userId: user._id,
      userName: user.name,
      userRole: user.role,
      action: "register",
      details: `Registered new clinic: ${clinicName} (${slug})`
    });

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(201).json({
      message: "Clinic registration successful",
      token,
      user: userResponse
    });
  } catch (error) {
    console.error("Register controller error:", error);
    if (error?.name === "ValidationError") {
      const message = Object.values(error.errors || {})
        .map((e) => e.message)
        .filter(Boolean)
        .join(". ") || error.message;
      return res.status(400).json({ message });
    }
    next(error);
  }
}

module.exports = {
  login,
  register,
  getMe
};
