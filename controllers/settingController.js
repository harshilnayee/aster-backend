const Setting = require("../models/Setting");

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

module.exports = {
  getFormSequence,
  updateFormSequence
};
