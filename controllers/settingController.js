const Setting = require("../models/Setting");
const {
  loadExportPrefsForUser,
  saveExportPrefsForUser
} = require("../utils/pdf/clinicExportPrefs");
const {
  getFieldCatalog,
  loadFormFieldRules,
  saveFormFieldRules
} = require("../utils/pdf/formFieldRules");

/**
 * Get global form sequence setting
 * GET /api/settings/form-sequence
 */
async function getFormSequence(req, res, next) {
  try {
    const setting = await Setting.findOne({ key: "formSequence" });
    if (!setting) {
      return res.status(200).json({ key: "formSequence", value: [] });
    }
    return res.status(200).json(setting);
  } catch (error) {
    console.error("getFormSequence error:", error);
    next(error);
  }
}

/**
 * Update global form sequence setting
 * POST /api/settings/form-sequence
 */
async function updateFormSequence(req, res, next) {
  try {
    const { value } = req.body;

    if (!Array.isArray(value)) {
      return res.status(400).json({ message: "Sequence value must be an array of form keys." });
    }

    const setting = await Setting.findOneAndUpdate(
      { key: "formSequence" },
      { value },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      message: "Form sequence updated successfully",
      setting
    });
  } catch (error) {
    console.error("updateFormSequence error:", error);
    next(error);
  }
}

/**
 * GET /api/settings/export-prefs
 */
async function getExportPrefs(req, res, next) {
  try {
    const prefs = await loadExportPrefsForUser(req.user);
    return res.status(200).json(prefs);
  } catch (error) {
    console.error("getExportPrefs error:", error);
    next(error);
  }
}

/**
 * POST /api/settings/export-prefs
 */
async function updateExportPrefs(req, res, next) {
  try {
    const prefs = await saveExportPrefsForUser(req.user, req.body || {});
    return res.status(200).json({
      message: "Clinic export preferences saved",
      prefs
    });
  } catch (error) {
    console.error("updateExportPrefs error:", error);
    next(error);
  }
}

/**
 * GET /api/settings/form-fields/:formKey
 */
async function getFormFieldRules(req, res, next) {
  try {
    const formKey = String(req.params.formKey || "").trim();
    if (!formKey) {
      return res.status(400).json({ message: "formKey is required" });
    }
    const [fields, rules] = await Promise.all([
      Promise.resolve(getFieldCatalog(formKey)),
      loadFormFieldRules(req.user, formKey)
    ]);
    return res.status(200).json({ formKey, fields, rules });
  } catch (error) {
    console.error("getFormFieldRules error:", error);
    next(error);
  }
}

/**
 * POST /api/settings/form-fields/:formKey
 */
async function updateFormFieldRules(req, res, next) {
  try {
    const formKey = String(req.params.formKey || "").trim();
    if (!formKey) {
      return res.status(400).json({ message: "formKey is required" });
    }
    const rules = await saveFormFieldRules(req.user, formKey, req.body?.rules || {});
    return res.status(200).json({
      message: "Form field defaults saved",
      formKey,
      rules
    });
  } catch (error) {
    console.error("updateFormFieldRules error:", error);
    next(error);
  }
}

module.exports = {
  getFormSequence,
  updateFormSequence,
  getExportPrefs,
  updateExportPrefs,
  getFormFieldRules,
  updateFormFieldRules
};
