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

module.exports = {
  getSummary,
  getCompanies
};
