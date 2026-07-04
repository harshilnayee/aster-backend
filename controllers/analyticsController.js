const Patient = require("../models/Patient");

/**
 * Returns a summary of medical operations statistics
 * GET /api/analytics/summary
 */
async function getSummary(req, res, next) {
  try {
    const patients = await Patient.find({}, "createdAt forms");

    const now = new Date();
    
    // Start of Today
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Start of Week (Sunday)
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    
    // Start of Month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Start of Year
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    let patientsToday = 0;
    let patientsThisWeek = 0;
    let patientsThisMonth = 0;
    let patientsThisYear = 0;

    let fitCount = 0;
    let unfitCount = 0;
    let completedReports = 0;
    let pendingReports = 0;

    patients.forEach((patient) => {
      const created = new Date(patient.createdAt);
      
      if (created >= startOfToday) patientsToday++;
      if (created >= startOfWeek) patientsThisWeek++;
      if (created >= startOfMonth) patientsThisMonth++;
      if (created >= startOfYear) patientsThisYear++;

      const forms = patient.forms || {};
      const fitStatus = forms.postMedical?.data?.fitStatus;

      if (fitStatus === "FIT") {
        fitCount++;
        completedReports++;
      } else if (fitStatus === "UNFIT") {
        unfitCount++;
        completedReports++;
      } else {
        // If not certified fit/unfit, check if they have any filled forms
        const hasFilledForms = [
          forms.healthRegister?.savedAt,
          forms.eyeExam?.savedAt,
          forms.form33?.savedAt,
          forms.postMedical?.savedAt,
          forms.xrayReport?.savedAt
        ].some(Boolean);

        if (hasFilledForms) {
          pendingReports++;
        }
      }
    });

    return res.status(200).json({
      patientsToday,
      patientsThisWeek,
      patientsThisMonth,
      patientsThisYear,
      fitCount,
      unfitCount,
      completedReports,
      pendingReports
    });
  } catch (error) {
    console.error("GetSummary analytics error:", error);
    next(error);
  }
}

/**
 * Returns patient volume grouped by company/factory
 * GET /api/analytics/companies
 */
async function getCompanies(req, res, next) {
  try {
    const companyStats = await Patient.aggregate([
      {
        $group: {
          _id: { $trim: { input: "$company" } },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          companyName: { $cond: [{ $eq: ["$_id", ""] }, "Aster Medcare", { $ifNull: ["$_id", "Aster Medcare"] }] },
          count: 1,
          _id: 0
        }
      },
      { $sort: { count: -1 } }
    ]);

    return res.status(200).json(companyStats);
  } catch (error) {
    console.error("GetCompanies analytics error:", error);
    next(error);
  }
}

/**
 * Returns summary and breakdown details for a single company
 * GET /api/analytics/company/:companyName
 */
async function getCompanyAnalytics(req, res, next) {
  try {
    const { companyName } = req.params;
    const comp = (companyName || "").trim();

    // Query patients matching the trimmed company name (case-insensitively to be safe)
    const escapedComp = comp.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const query = {
      $or: [
        { company: comp },
        { company: { $regex: new RegExp("^\\s*" + escapedComp + "\\s*$", "i") } }
      ]
    };

    const patients = await Patient.find(query);

    const totalWorkers = patients.length;
    let fitCount = 0;
    let unfitCount = 0;
    let completedReports = 0;
    let pendingReports = 0;
    let totalAge = 0;

    let male = 0;
    let female = 0;
    let other = 0;

    let staff = 0;
    let contractual = 0;
    let unspecifiedType = 0;

    const deptCounts = {};

    patients.forEach((patient) => {
      totalAge += (patient.age || 0);

      // Gender count
      const g = (patient.gender || "").toLowerCase().trim();
      if (g === "male") male++;
      else if (g === "female") female++;
      else other++;

      // Employment Type count
      const et = (patient.employmentType || "").toLowerCase().trim();
      if (et === "staff") staff++;
      else if (et === "contractual" || et === "contract") contractual++;
      else unspecifiedType++;

      // Department count
      const dept = (patient.department || "").trim() || "Unspecified";
      deptCounts[dept] = (deptCounts[dept] || 0) + 1;

      // Fit status count (using the same logic as getSummary)
      const forms = patient.forms || {};
      const fitStatus = forms.postMedical?.data?.fitStatus;

      if (fitStatus === "FIT") {
        fitCount++;
        completedReports++;
      } else if (fitStatus === "UNFIT") {
        unfitCount++;
        completedReports++;
      } else {
        const hasFilledForms = [
          forms.healthRegister?.savedAt,
          forms.eyeExam?.savedAt,
          forms.form33?.savedAt,
          forms.postMedical?.savedAt,
          forms.xrayReport?.savedAt
        ].some(Boolean);

        if (hasFilledForms) {
          pendingReports++;
        }
      }
    });

    const averageAge = totalWorkers > 0 ? parseFloat((totalAge / totalWorkers).toFixed(1)) : 0;

    const genderBreakdown = { male, female, other };
    const employmentTypeBreakdown = { staff, contractual, unspecified: unspecifiedType };

    const departmentBreakdown = Object.entries(deptCounts)
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count);

    const recentPatients = patients
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5)
      .map((p) => {
        const fitVal = p.forms?.postMedical?.data?.fitStatus;
        const fitStatus = fitVal === "FIT" ? "FIT" : (fitVal === "UNFIT" ? "UNFIT" : "PENDING");
        return {
          patientId: p.patientId,
          name: p.name,
          fitStatus
        };
      });

    return res.status(200).json({
      totalWorkers,
      fitCount,
      unfitCount,
      pendingReports,
      completedReports,
      averageAge,
      genderBreakdown,
      employmentTypeBreakdown,
      departmentBreakdown,
      recentPatients
    });
  } catch (error) {
    console.error("GetCompanyAnalytics error:", error);
    next(error);
  }
}

module.exports = {
  getSummary,
  getCompanies,
  getCompanyAnalytics
};
