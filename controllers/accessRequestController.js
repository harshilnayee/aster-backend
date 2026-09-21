const AccessRequest = require("../models/AccessRequest");
const User = require("../models/User");
const Clinic = require("../models/Clinic");
const Patient = require("../models/Patient");
const AuditLog = require("../models/AuditLog");
const { generatePatientId } = require("../utils/patientId");
const path = require("path");
const fs = require("fs");

function getAllFormKeys() {
  const registryPath = path.join(__dirname, "../config/formRegistry.json");
  if (!fs.existsSync(registryPath)) return [];
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  return Object.keys(registry);
}

/**
 * Public: Submit a registration access request
 * POST /api/access-requests
 */
async function submitRequest(req, res, next) {
  try {
    const { name, email, password, clinicName, mobile, doctorRegNo, doctorQualification, cityState, monthlyVolume } = req.body;

    if (!name || !email || !password || !clinicName) {
      return res.status(400).json({ message: "Name, email, password, and clinic name are required." });
    }

    const targetEmail = email.toLowerCase().trim();

    // Check email format
    if (!/^\S+@\S+\.\S+$/.test(targetEmail)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }

    // Check password requirements
    if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return res.status(400).json({
        message: "Password must be at least 10 characters long and include an uppercase letter, lowercase letter, number, and symbol."
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: targetEmail });
    if (existingUser) {
      return res.status(400).json({ message: "An active user account with this email address already exists." });
    }

    // Check if there is already a pending request for this email
    const existingReq = await AccessRequest.findOne({ email: targetEmail, status: "pending" });
    if (existingReq) {
      return res.status(200).json({
        message: "An access request for this email is already pending superadmin review.",
        request: existingReq
      });
    }

    // Create new AccessRequest
    const accessReq = await AccessRequest.create({
      email: targetEmail,
      name: name.trim(),
      clinicName: clinicName.trim(),
      cityState: (cityState || "").trim(),
      doctorRegNo: (doctorRegNo || "").trim(),
      doctorQualification: (doctorQualification || "").trim(),
      mobile: (mobile || "").trim(),
      monthlyVolume: (monthlyVolume || "").trim(),
      password, // Password stored for creation upon superadmin approval
      status: "pending"
    });

    return res.status(201).json({
      message: "Access request submitted successfully! Pending superadmin approval.",
      request: accessReq
    });
  } catch (err) {
    console.error("submitRequest error:", err);
    next(err);
  }
}

/**
 * Superadmin: List all access requests
 * GET /api/access-requests
 */
async function listRequests(req, res, next) {
  try {
    const requests = await AccessRequest.find().sort({ createdAt: -1 }).lean();
    return res.status(200).json({ requests });
  } catch (err) {
    console.error("listRequests error:", err);
    next(err);
  }
}

/**
 * Superadmin: Approve access request and create user + clinic
 * POST /api/access-requests/:id/approve
 */
async function approveRequest(req, res, next) {
  try {
    const accessReq = await AccessRequest.findById(req.params.id);
    if (!accessReq) {
      return res.status(404).json({ message: "Access request not found." });
    }

    if (accessReq.status === "approved") {
      return res.status(400).json({ message: "This request has already been approved." });
    }

    // Check if user email was registered in the meantime
    const existingUser = await User.findOne({ email: accessReq.email });
    if (existingUser) {
      accessReq.status = "approved";
      accessReq.reviewedBy = req.user._id;
      accessReq.reviewedAt = new Date();
      await accessReq.save();
      return res.status(200).json({ message: "User account already exists. Request marked approved." });
    }

    // Generate safe clinic slug
    const baseSlug = accessReq.clinicName.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 30) || "clinic";
    const slug = `${baseSlug}_${Date.now().toString(36)}`;

    // 1. Create Clinic
    const clinic = await Clinic.create({
      slug,
      name: accessReq.clinicName,
      doctorName: accessReq.name,
      doctorRegNo: accessReq.doctorRegNo,
      doctorQualification: accessReq.doctorQualification,
      cityState: accessReq.cityState,
      monthlyVolume: accessReq.monthlyVolume,
      address: accessReq.cityState ? `${accessReq.cityState}, Occupational Health Center` : "Main Occupational Health Center"
    });

    // 2. Create User
    const user = await User.create({
      name: accessReq.name,
      email: accessReq.email,
      password: accessReq.password,
      role: "admin",
      clinicId: clinic._id,
      isActive: true,
      formAccess: getAllFormKeys()
    });

    // 3. Seed demo patients
    try {
      const demoId1 = await generatePatientId();
      await Patient.create({
        patientId: demoId1,
        name: "Rajesh Kumar (Sample)",
        age: 34,
        gender: "Male",
        mobile: accessReq.mobile || "9876543210",
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

    // 4. Update request status
    accessReq.status = "approved";
    accessReq.reviewedBy = req.user._id;
    accessReq.reviewedAt = new Date();
    await accessReq.save();

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "register",
      details: `Approved access request for ${accessReq.email} (Clinic: ${clinic.name})`
    });

    return res.status(200).json({
      message: `Access request approved! Clinic '${clinic.name}' and user '${user.email}' created successfully.`,
      clinic,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error("approveRequest error:", err);
    next(err);
  }
}

/**
 * Superadmin: Reject access request
 * POST /api/access-requests/:id/reject
 */
async function rejectRequest(req, res, next) {
  try {
    const accessReq = await AccessRequest.findById(req.params.id);
    if (!accessReq) {
      return res.status(404).json({ message: "Access request not found." });
    }

    accessReq.status = "rejected";
    accessReq.reviewedBy = req.user._id;
    accessReq.reviewedAt = new Date();
    await accessReq.save();

    return res.status(200).json({
      message: `Access request for ${accessReq.email} rejected.`,
      request: accessReq
    });
  } catch (err) {
    console.error("rejectRequest error:", err);
    next(err);
  }
}

module.exports = {
  submitRequest,
  listRequests,
  approveRequest,
  rejectRequest
};
