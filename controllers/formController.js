const mongoose = require("mongoose");
const Patient = require("../models/Patient");
const AuditLog = require("../models/AuditLog");

// List of currently supported form types in the schema
const ALLOWED_FORMS = [
  "postMedical",
  "eyeExam",
  "form33",
  "healthRegister",
  "xrayReport"
];

/**
 * Save form data under patient.forms[formType]
 * POST /api/patients/:id/forms/:formType
 */
async function saveForm(req, res, next) {
  try {
    const { id, formType } = req.params;
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({ message: "Form data object is required" });
    }

    // Determine query based on ID format
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id }
      : { patientId: id };

    const patient = await Patient.findOne(query);
    if (!patient) {
      return res.status(404).json({ message: "Patient record not found" });
    }

    // Update the specific form
    patient.forms = patient.forms || {};
    
    // We dynamically support the formType name in the forms object.
    // If it's a new form type (one of the other 19), it will save correctly
    // as mongoose.Schema.Types.Mixed allows it.
    patient.forms[formType] = {
      data: data,
      savedAt: new Date(),
      savedBy: req.user._id
    };

    // Mark the forms path as modified so mongoose saves the nested updates
    patient.markModified(`forms.${formType}`);
    await patient.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "form_saved",
      patientId: patient.patientId,
      details: `Saved form data for form type: ${formType}`
    });

    return res.status(200).json({
      message: `Form ${formType} saved successfully`,
      form: patient.forms[formType]
    });
  } catch (error) {
    console.error("SaveForm error:", error);
    next(error);
  }
}

/**
 * Get specific form data for a patient
 * GET /api/patients/:id/forms/:formType
 */
async function getForm(req, res, next) {
  try {
    const { id, formType } = req.params;

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id }
      : { patientId: id };

    const patient = await Patient.findOne(query)
      .populate(`forms.${formType}.savedBy`, "name email role");

    if (!patient) {
      return res.status(404).json({ message: "Patient record not found" });
    }

    const form = patient.forms ? patient.forms[formType] : null;
    if (!form || !form.savedAt) {
      return res.status(404).json({
        message: `Form ${formType} has not been filled yet for this patient`,
        formExists: false
      });
    }

    return res.status(200).json({
      formExists: true,
      form
    });
  } catch (error) {
    console.error("GetForm error:", error);
    next(error);
  }
}

module.exports = {
  saveForm,
  getForm
};
