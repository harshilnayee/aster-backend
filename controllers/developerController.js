const AuditLog = require("../models/AuditLog");
const Patient = require("../models/Patient");
const User    = require("../models/User");
const Clinic  = require("../models/Clinic");

const AUDIT_ACTIONS = [
  "patient_created",
  "patient_updated",
  "patient_deleted",
  "form_saved",
  "file_uploaded",
  "report_generated",
  "report_downloaded",
  "login",
  "logout",
  "whatsapp_reminder_sent"
];

/**
 * System overview for developer super-user (read-only).
 * GET /api/developer/stats
 */
async function getSystemStats(req, res, next) {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [patientCount, userCount, auditCount24h, usersByRole, recentActivity] = await Promise.all([
      Patient.countDocuments(),
      User.countDocuments({ role: { $ne: "superadmin" } }),
      AuditLog.countDocuments({ timestamp: { $gte: since24h } }),
      User.aggregate([
        { $match: { role: { $ne: "superadmin" } } },
        { $group: { _id: "$role", count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      AuditLog.find().sort({ timestamp: -1 }).limit(5).lean()
    ]);

    const actionBreakdown24h = await AuditLog.aggregate([
      { $match: { timestamp: { $gte: since24h } } },
      { $group: { _id: "$action", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    return res.status(200).json({
      patientCount,
      userCount,
      auditCount24h,
      usersByRole,
      actionBreakdown24h,
      recentActivity,
      serverTime: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || "production"
    });
  } catch (error) {
    console.error("getSystemStats error:", error);
    next(error);
  }
}

/**
 * Paginated audit log stream for developer super-user.
 * GET /api/developer/audit-logs?limit=50&offset=0&action=login
 */
async function getAuditLogs(req, res, next) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const action = req.query.action;

    const query = {};
    if (action && AUDIT_ACTIONS.includes(action)) {
      query.action = action;
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query).sort({ timestamp: -1 }).skip(offset).limit(limit).lean(),
      AuditLog.countDocuments(query)
    ]);

    return res.status(200).json({
      logs,
      total,
      limit,
      offset,
      actions: AUDIT_ACTIONS
    });
  } catch (error) {
    console.error("getAuditLogs error:", error);
    next(error);
  }
}

/**
 * List all clinics (superadmin only)
 * GET /api/developer/clinics
 */
async function getClinics(req, res, next) {
  try {
    const clinics = await Clinic.find().sort({ createdAt: -1 }).lean();

    // Attach patient + user counts per clinic
    const enriched = await Promise.all(
      clinics.map(async (c) => {
        const [patients, users] = await Promise.all([
          Patient.countDocuments({ clinicId: c._id }),
          User.countDocuments({ clinicId: c._id })
        ]);
        return { ...c, patientCount: patients, userCount: users };
      })
    );

    return res.status(200).json(enriched);
  } catch (error) {
    console.error("getClinics error:", error);
    next(error);
  }
}

/**
 * Create a new clinic + its first admin user in one shot (superadmin only)
 * POST /api/developer/clinics
 * Body: { clinicName, slug, adminName, adminEmail, adminPassword, doctorName?, address? }
 */
async function createClinic(req, res, next) {
  try {
    const { clinicName, slug, adminName, adminEmail, adminPassword, doctorName, address } = req.body;

    // ── Validate required fields ─────────────────────────────────────────
    if (!clinicName || !slug || !adminName || !adminEmail || !adminPassword) {
      return res.status(400).json({
        message: "clinicName, slug, adminName, adminEmail, and adminPassword are all required."
      });
    }

    // slug must be lowercase letters/numbers/underscores only
    if (!/^[a-z0-9_]+$/.test(slug)) {
      return res.status(400).json({
        message: "Slug can only contain lowercase letters, numbers, and underscores (e.g. adani_ohc)"
      });
    }

    // Check slug uniqueness
    const existingClinic = await Clinic.findOne({ slug });
    if (existingClinic) {
      return res.status(409).json({ message: `A clinic with slug '${slug}' already exists.` });
    }

    // Check email uniqueness
    const existingUser = await User.findOne({ email: adminEmail.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: `A user with email '${adminEmail}' already exists.` });
    }

    // ── Create clinic ────────────────────────────────────────────────────
    const clinic = await Clinic.create({
      slug,
      name: clinicName,
      address: address || "",
      doctorName: doctorName || "",
      isActive: true
    });

    // ── Create admin user for this clinic ────────────────────────────────
    const user = new User({
      name: adminName,
      email: adminEmail.toLowerCase(),
      password: adminPassword,  // Mongoose hook will hash it
      role: "admin",
      formAccess: [],           // admin gets all access by default in the app logic
      isActive: true,
      clinicId: clinic._id
    });
    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(201).json({
      message: `Clinic '${clinicName}' created with admin user '${adminEmail}'.`,
      clinic,
      admin: userResponse
    });
  } catch (error) {
    console.error("createClinic error:", error);
    next(error);
  }
}

module.exports = {
  getSystemStats,
  getAuditLogs,
  getClinics,
  createClinic
};
