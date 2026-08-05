const mongoose = require("mongoose");
const Patient = require("../models/Patient");
const AuditLog = require("../models/AuditLog");

function buildPatientQuery(id, req) {
  const clinicScope =
    req?.user?.role === "superadmin" || !req?.user?.clinicId
      ? {}
      : { clinicId: req.user.clinicId };
  const base = mongoose.Types.ObjectId.isValid(id)
    ? { _id: id }
    : { patientId: id };
  return { ...base, ...(req?.tenantFilter || {}), ...clinicScope };
}

/**
 * Save form data under patient.forms[formType]
 * Uses atomic $set on only that form key so concurrent saves of other forms are not overwritten.
 * POST /api/patients/:id/forms/:formType
 */
async function saveForm(req, res, next) {
  try {
    const { id, formType } = req.params;
    const { data } = req.body;
    let { isDraft } = req.body;

    if (!data) {
      return res.status(400).json({ message: "Form data object is required" });
    }

    const query = buildPatientQuery(id, req);
    const draftRequested = isDraft === true;

    // Never demote a finalized form back to draft (autosave race after final save)
    if (draftRequested) {
      const existing = await Patient.findOne(query)
        .select(`forms.${formType}`)
        .lean();
      const current = existing?.forms?.[formType];
      if (current?.savedAt && current.isDraft === false) {
        return res.status(200).json({
          message: `Form ${formType} already finalized; draft autosave skipped`,
          form: current,
          skippedDraftDemotion: true
        });
      }
    }

    const formEntry = {
      data,
      savedAt: new Date(),
      savedBy: req.user._id,
      isDraft: draftRequested
    };

    const $set = {
      [`forms.${formType}`]: formEntry
    };

    // Persist permanent examination date when present on the form payload
    const formDate =
      data.date ||
      data.dateTop ||
      data.examinationDate ||
      data.examDate ||
      data.regDate ||
      data.certDate;
    if (formDate && typeof formDate === "string" && formDate.trim()) {
      $set.examinationDate = formDate.split("T")[0];
    } else if (formDate instanceof Date && !Number.isNaN(formDate.getTime())) {
      $set.examinationDate = formDate.toISOString().split("T")[0];
    }

    const patient = await Patient.findOneAndUpdate(query, { $set }, { new: true })
      .select(`patientId forms.${formType}`);

    if (!patient) {
      return res.status(404).json({ message: "Patient record not found" });
    }

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

    const query = buildPatientQuery(id, req);

    const patient = await Patient.findOne(query)
      .select(`forms.${formType} patientId`)
      .populate(`forms.${formType}.savedBy`, "name email role")
      .lean();

    if (!patient) {
      return res.status(404).json({ message: "Patient record not found" });
    }

    const form = patient.forms ? patient.forms[formType] : null;
    if (!form || !form.savedAt) {
      return res.status(200).json({
        message: `Form ${formType} has not been filled yet for this patient`,
        formExists: false,
        form: null
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
