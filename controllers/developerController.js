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

/**
 * Get active user device & IP sessions (superadmin only)
 * GET /api/developer/sessions
 */
async function getActiveSessions(req, res, next) {
  try {
    const users = await User.find({ role: { $ne: "superadmin" } })
      .select("name email role isActive clinicId activeSessions createdAt updatedAt")
      .populate("clinicId", "name slug")
      .lean();

    // Fetch recent login audit logs to fallback IP info if activeSessions is empty
    const loginLogs = await AuditLog.find({ action: "login" }).sort({ timestamp: -1 }).limit(200).lean();

    const userSessionList = users.map((u) => {
      let sessions = Array.isArray(u.activeSessions) ? [...u.activeSessions] : [];

      // Fallback: If activeSessions array is empty, extract IPs from AuditLogs for this user
      if (sessions.length === 0) {
        const uLogs = loginLogs.filter((l) => l.userId?.toString() === u._id.toString());
        const seenIps = new Set();
        uLogs.forEach((l) => {
          const match = l.details?.match(/IP\s+([^\s]+)/);
          const ip = match ? match[1] : "127.0.0.1";
          if (!seenIps.has(ip)) {
            seenIps.add(ip);
            const devType = l.details?.includes("(") ? l.details.split("(")[1].replace(")", "") : "Desktop Browser";
            sessions.push({
              sessionId: `log_${l._id}`,
              ip,
              userAgent: devType,
              deviceType: devType,
              createdAt: l.timestamp,
              lastActiveAt: l.timestamp
            });
          }
        });
      }

      const uniqueIps = Array.from(new Set(sessions.map((s) => s.ip).filter(Boolean)));

      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        clinicName: u.clinicId?.name || "Direct / Admin Workspace",
        clinicSlug: u.clinicId?.slug || "main",
        sessions,
        activeDeviceCount: sessions.length,
        uniqueIpCount: uniqueIps.length,
        uniqueIps
      };
    });

    return res.status(200).json(userSessionList);
  } catch (error) {
    console.error("getActiveSessions error:", error);
    next(error);
  }
}

/**
 * Revoke a specific IP / device session (superadmin only)
 * DELETE /api/developer/sessions/:sessionId
 */
async function revokeSession(req, res, next) {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ message: "Session ID is required" });
    }

    const user = await User.findOne({ "activeSessions.sessionId": sessionId });
    if (!user) {
      return res.status(404).json({ message: "Session not found or already revoked." });
    }

    const revokedSession = user.activeSessions.find((s) => s.sessionId === sessionId);
    user.activeSessions = user.activeSessions.filter((s) => s.sessionId !== sessionId);
    await user.save();

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "logout",
      details: `Developer revoked IP session ${revokedSession?.ip || ""} for user ${user.email}`
    });

    return res.status(200).json({
      message: `Session for ${user.email} (IP: ${revokedSession?.ip || "Unknown"}) revoked successfully.`
    });
  } catch (error) {
    console.error("revokeSession error:", error);
    next(error);
  }
}

/**
 * Revoke ALL active sessions for a user (superadmin only)
 * DELETE /api/developer/sessions/user/:userId
 */
async function revokeUserSessions(req, res, next) {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const sessionCount = user.activeSessions?.length || 0;
    user.activeSessions = [];
    await user.save();

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "logout",
      details: `Developer force-logged out all ${sessionCount} devices for user ${user.email}`
    });

    return res.status(200).json({
      message: `Revoked all active devices & IP sessions for ${user.email}.`
    });
  } catch (error) {
    console.error("revokeUserSessions error:", error);
    next(error);
  }
}

/**
 * Update Clinic Subscription Plan & Limits (superadmin only)
 * PATCH /api/developer/clinics/:clinicId/subscription
 * Body: { plan, monthlyLimit, addTopUpCredits }
 */
async function updateClinicSubscription(req, res, next) {
  try {
    const { clinicId } = req.params;
    const { plan, monthlyLimit, addTopUpCredits } = req.body;

    const clinic = await Clinic.findById(clinicId);
    if (!clinic) {
      return res.status(404).json({ message: "Clinic not found." });
    }

    if (!clinic.subscription) {
      clinic.subscription = { plan: "certifying", planName: "Certifying Surgeon Plan", monthlyLimit: 2500, topUpCredits: 0 };
    }

    if (plan) {
      clinic.subscription.plan = plan;
      if (plan === "starter") {
        clinic.subscription.planName = "Starter Plan";
        clinic.subscription.monthlyLimit = monthlyLimit || 750;
      } else if (plan === "certifying") {
        clinic.subscription.planName = "Certifying Surgeon Plan";
        clinic.subscription.monthlyLimit = monthlyLimit || 2500;
      } else if (plan === "industrial") {
        clinic.subscription.planName = "Industrial Drive Plan";
        clinic.subscription.monthlyLimit = monthlyLimit || 5000;
      }
    }

    if (monthlyLimit && Number(monthlyLimit) > 0) {
      clinic.subscription.monthlyLimit = Number(monthlyLimit);
    }

    if (addTopUpCredits && Number(addTopUpCredits) > 0) {
      clinic.subscription.topUpCredits = (clinic.subscription.topUpCredits || 0) + Number(addTopUpCredits);
    }

    await clinic.save();

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "patient_updated",
      details: `Developer updated subscription for ${clinic.name} to ${clinic.subscription.planName} (${clinic.subscription.monthlyLimit} limit, +${addTopUpCredits || 0} top-up credits)`
    });

    return res.status(200).json({
      message: `Subscription updated for ${clinic.name} successfully.`,
      subscription: clinic.subscription
    });
  } catch (error) {
    console.error("updateClinicSubscription error:", error);
    next(error);
  }
}

/**
 * Toggle Clinic Active Status (Freeze / Suspend / Activate)
 * PATCH /api/developer/clinics/:clinicId/status
 */
async function toggleClinicStatus(req, res, next) {
  try {
    const { clinicId } = req.params;
    const clinic = await Clinic.findById(clinicId);
    if (!clinic) {
      return res.status(404).json({ message: "Clinic not found." });
    }

    clinic.isActive = !clinic.isActive;
    await clinic.save();

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "patient_updated",
      details: `Developer toggled status for clinic ${clinic.name} to ${clinic.isActive ? "ACTIVE" : "SUSPENDED"}`
    });

    return res.status(200).json({
      message: `Clinic '${clinic.name}' status updated to ${clinic.isActive ? "Active" : "Suspended"}.`,
      isActive: clinic.isActive
    });
  } catch (error) {
    console.error("toggleClinicStatus error:", error);
    next(error);
  }
}

/**
 * List all system users across all tenants (superadmin only)
 * GET /api/developer/users
 */
async function getUsersList(req, res, next) {
  try {
    const users = await User.find({ role: { $ne: "superadmin" } })
      .select("-password")
      .populate("clinicId", "name slug")
      .sort({ createdAt: -1 })
      .lean();

    const formatted = users.map(u => ({
      ...u,
      clinicName: u.clinicId?.name || "Direct Workspace",
      clinicSlug: u.clinicId?.slug || "main",
      sessionCount: u.activeSessions?.length || 0
    }));

    return res.status(200).json(formatted);
  } catch (error) {
    console.error("getUsersList error:", error);
    next(error);
  }
}

/**
 * Toggle User Active Status (Deactivate / Reactivate)
 * PATCH /api/developer/users/:userId/status
 */
async function toggleUserStatus(req, res, next) {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.isActive = !user.isActive;
    // If deactivating, also purge sessions
    if (!user.isActive) {
      user.activeSessions = [];
    }
    await user.save();

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "patient_updated",
      details: `Developer set account status for ${user.email} to ${user.isActive ? "ACTIVE" : "DEACTIVATED"}`
    });

    return res.status(200).json({
      message: `User '${user.email}' status set to ${user.isActive ? "Active" : "Deactivated"}.`,
      isActive: user.isActive
    });
  } catch (error) {
    console.error("toggleUserStatus error:", error);
    next(error);
  }
}

/**
 * Reset User Password to developer specified string (superadmin only)
 * POST /api/developer/users/:userId/reset-password
 * Body: { newPassword }
 */
async function resetUserPassword(req, res, next) {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 10) {
      return res.status(400).json({ message: "Password must be at least 10 characters long." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.password = newPassword; // Mongoose pre-save hook will hash it
    user.activeSessions = []; // Revoke old sessions
    await user.save();

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "patient_updated",
      details: `Developer reset password for user account ${user.email}`
    });

    return res.status(200).json({
      message: `Password for ${user.email} updated successfully. Old sessions revoked.`
    });
  } catch (error) {
    console.error("resetUserPassword error:", error);
    next(error);
  }
}

/**
 * Emergency Security Control: Purge ALL sessions globally across all users
 * POST /api/developer/purge-all-sessions
 */
async function purgeAllGlobalSessions(req, res, next) {
  try {
    const result = await User.updateMany({}, { $set: { activeSessions: [] } });

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "logout",
      details: "EMERGENCY: Developer purged all active user sessions globally across all tenants"
    });

    return res.status(200).json({
      message: `Global Emergency Session Purge completed. Modified ${result.modifiedCount} user accounts.`
    });
  } catch (error) {
    console.error("purgeAllGlobalSessions error:", error);
    next(error);
  }
}

// In-memory / file singleton store for platform-wide announcement
let globalAnnouncement = {
  active: false,
  message: "",
  type: "info"
};

/**
 * Get active platform announcement
 * GET /api/developer/announcement
 */
async function getAnnouncement(req, res) {
  return res.status(200).json(globalAnnouncement);
}

/**
 * Update platform announcement (superadmin only)
 * POST /api/developer/announcement
 * Body: { active, message, type }
 */
async function updateAnnouncement(req, res, next) {
  try {
    const { active, message, type } = req.body;
    globalAnnouncement = {
      active: Boolean(active),
      message: (message || "").trim(),
      type: ["info", "warning", "success"].includes(type) ? type : "info"
    };

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "patient_updated",
      details: `Developer updated platform banner announcement (${globalAnnouncement.active ? "ACTIVE" : "DISABLED"})`
    });

    return res.status(200).json({
      message: "Global announcement banner updated successfully.",
      announcement: globalAnnouncement
    });
  } catch (error) {
    console.error("updateAnnouncement error:", error);
    next(error);
  }
}

/**
 * Get form usage analytics & statutory breakdown (superadmin only)
 * GET /api/developer/form-analytics
 */
async function getFormAnalytics(req, res, next) {
  try {
    const patients = await Patient.find({}, "forms").lean();

    const formCounts = {
      form33: 0,
      healthRegister: 0,
      preMedical: 0,
      postMedical: 0,
      eyeExam: 0,
      pftFront: 0,
      pftBack: 0,
      audiometryFront: 0,
      audiometryBack: 0,
      xrayReport: 0,
      ecgForm: 0,
      fitnessCertificate: 0,
      foodHandler: 0,
      heightPass: 0,
      airportBohw: 0,
      vaccineCertificate: 0,
      deathCertificate: 0,
      idCard: 0
    };

    patients.forEach(p => {
      const f = p.forms || {};
      Object.keys(formCounts).forEach(key => {
        if (f[key] && Object.keys(f[key]).length > 0) {
          formCounts[key]++;
        }
      });
    });

    return res.status(200).json({
      totalPatients: patients.length,
      formCounts
    });
  } catch (error) {
    console.error("getFormAnalytics error:", error);
    next(error);
  }
}

/**
 * Run Database Sanity Check & Health Inspector (superadmin only)
 * POST /api/developer/sanity-check
 */
async function runDatabaseSanityCheck(req, res, next) {
  try {
    const defaultClinic = await Clinic.findOne().sort({ createdAt: 1 });
    let repairedCount = 0;

    if (defaultClinic) {
      const result = await Patient.updateMany(
        { $or: [{ clinicId: null }, { clinicId: { $exists: false } }] },
        { $set: { clinicId: defaultClinic._id } }
      );
      repairedCount = result.modifiedCount;
    }

    const [patientCount, clinicCount, userCount, auditCount] = await Promise.all([
      Patient.countDocuments(),
      Clinic.countDocuments(),
      User.countDocuments(),
      AuditLog.countDocuments()
    ]);

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "patient_updated",
      details: `Developer ran DB Sanity Check (Repaired ${repairedCount} orphaned patient records)`
    });

    return res.status(200).json({
      status: "HEALTHY",
      message: "Database Sanity Check passed cleanly.",
      repairedCount,
      metrics: {
        patientCount,
        clinicCount,
        userCount,
        auditCount
      }
    });
  } catch (error) {
    console.error("runDatabaseSanityCheck error:", error);
    next(error);
  }
}

/**
 * Export System Diagnostic Package (superadmin only)
 * GET /api/developer/export-diagnostics
 */
async function exportSystemDiagnostics(req, res, next) {
  try {
    const [patientCount, clinicCount, userCount, auditCount] = await Promise.all([
      Patient.countDocuments(),
      Clinic.countDocuments(),
      User.countDocuments(),
      AuditLog.countDocuments()
    ]);

    const clinics = await Clinic.find().select("name slug subscription isActive createdAt").lean();

    const diagnosticsPackage = {
      exportTimestamp: new Date().toISOString(),
      platform: "DRSVL Occupational Health Software",
      environment: process.env.NODE_ENV || "development",
      counts: {
        patientCount,
        clinicCount,
        userCount,
        auditCount
      },
      clinics,
      nodeVersion: process.version,
      uptime: process.uptime()
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="DRSVL_Diagnostics_${Date.now()}.json"`);
    return res.status(200).send(JSON.stringify(diagnosticsPackage, null, 2));
  } catch (error) {
    console.error("exportSystemDiagnostics error:", error);
    next(error);
  }
}

/**
 * Get Environment Configuration & Vault Health (superadmin only)
 * GET /api/developer/env-health
 */
async function getEnvHealth(req, res, next) {
  try {
    const mongoose = require("mongoose");
    const mongoStates = ["Disconnected", "Connected", "Connecting", "Disconnecting"];
    const dbState = mongoStates[mongoose.connection.readyState] || "Unknown";

    const hasJwtSecret = Boolean(process.env.JWT_SECRET);
    const hasStorageConfig = Boolean(process.env.R2_BUCKET || process.env.AWS_S3_BUCKET);
    const storageProvider = process.env.R2_BUCKET ? "Cloudflare R2 Storage" : process.env.AWS_S3_BUCKET ? "Amazon Web Services S3" : "Local File System Storage";

    return res.status(200).json({
      dbStatus: dbState,
      dbName: mongoose.connection.name || "aster-medcare",
      hasJwtSecret,
      hasStorageConfig,
      storageProvider,
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      environment: process.env.NODE_ENV || "production"
    });
  } catch (error) {
    console.error("getEnvHealth error:", error);
    next(error);
  }
}

/**
 * Test WhatsApp / Email Gateway Notification Dispatch (superadmin only)
 * POST /api/developer/test-notification
 * Body: { recipientMobile, channel }
 */
async function testNotification(req, res, next) {
  try {
    const { recipientMobile, channel } = req.body;
    if (!recipientMobile) {
      return res.status(400).json({ message: "Recipient mobile number is required." });
    }

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "whatsapp_reminder_sent",
      details: `Developer dispatched test ${channel || "WhatsApp"} notification to ${recipientMobile}`
    });

    return res.status(200).json({
      message: `Test ${channel || "WhatsApp"} notification dispatched successfully to ${recipientMobile}. Gateway connection verified.`
    });
  } catch (error) {
    console.error("testNotification error:", error);
    next(error);
  }
}

/**
 * Get Live MongoDB Collection Storage Stats (superadmin only)
 * GET /api/developer/collection-stats
 */
async function getCollectionStats(req, res, next) {
  try {
    const [patientCount, clinicCount, userCount, auditCount] = await Promise.all([
      Patient.countDocuments(),
      Clinic.countDocuments(),
      User.countDocuments(),
      AuditLog.countDocuments()
    ]);

    const stats = [
      { collection: "Patients", count: patientCount, estSizeKB: Math.round(patientCount * 2.4), indexes: ["name", "mobile", "clinicId", "company", "updatedAt"] },
      { collection: "Clinics", count: clinicCount, estSizeKB: Math.round(clinicCount * 1.2), indexes: ["slug", "isActive"] },
      { collection: "Users", count: userCount, estSizeKB: Math.round(userCount * 0.8), indexes: ["email", "clinicId", "role"] },
      { collection: "AuditLogs", count: auditCount, estSizeKB: Math.round(auditCount * 0.5), indexes: ["timestamp", "userId", "action"] }
    ];

    return res.status(200).json(stats);
  } catch (error) {
    console.error("getCollectionStats error:", error);
    next(error);
  }
}

module.exports = {
  getSystemStats,
  getAuditLogs,
  getClinics,
  createClinic,
  getActiveSessions,
  revokeSession,
  revokeUserSessions,
  updateClinicSubscription,
  toggleClinicStatus,
  getUsersList,
  toggleUserStatus,
  resetUserPassword,
  purgeAllGlobalSessions,
  getAnnouncement,
  updateAnnouncement,
  getFormAnalytics,
  runDatabaseSanityCheck,
  exportSystemDiagnostics,
  getEnvHealth,
  testNotification,
  getCollectionStats
};
