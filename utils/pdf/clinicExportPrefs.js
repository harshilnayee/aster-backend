const Clinic = require("../../models/Clinic");
const Setting = require("../../models/Setting");

const DEFAULT_EXPORT_PREFS = {
  stampMode: "fill",
  emptyFieldMode: "blank",
  includeUnsavedForms: true,
  defaultExportMode: "zip"
};

const IDENTITY_KEYS =
  /^(name|surname|age|sex|gender|date|dateTop|dob|examinationDate|examDate|regDate|certDate|companyName|company|employeeCode|empCode|patientId|mobileNo|mobile|fatherName|fatherHusbandName)$/i;

const SKIP_NA_KEYS = /signature|photo|stamp|cross|check|draw|image|base64/i;

function normalizeExportPrefs(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    stampMode: src.stampMode === "handwrite" ? "handwrite" : "fill",
    emptyFieldMode: src.emptyFieldMode === "NA" ? "NA" : "blank",
    includeUnsavedForms: src.includeUnsavedForms !== false,
    defaultExportMode: src.defaultExportMode === "merged-pdf" ? "merged-pdf" : "zip"
  };
}

function applyStampMode(values, stampMode) {
  if (stampMode !== "handwrite" || !values || typeof values !== "object") return values;
  const out = { ...values };
  for (const key of Object.keys(out)) {
    if (IDENTITY_KEYS.test(key)) continue;
    if (SKIP_NA_KEYS.test(key)) continue;
    if (typeof out[key] === "string" && out[key].startsWith("data:")) continue;
    out[key] = "";
  }
  return out;
}

function applyEmptyFieldMode(values, emptyFieldMode) {
  if (emptyFieldMode !== "NA" || !values || typeof values !== "object") return values;
  const out = { ...values };
  for (const [key, val] of Object.entries(out)) {
    if (SKIP_NA_KEYS.test(key)) continue;
    if (typeof val === "string" && val.startsWith("data:")) continue;
    if (val === undefined || val === null || val === "") out[key] = "NA";
  }
  return out;
}

function applyExportPrefsToValues(values, prefs) {
  const next = applyStampMode(values, prefs?.stampMode);
  if (prefs?.stampMode === "handwrite") return next;
  return applyEmptyFieldMode(next, prefs?.emptyFieldMode);
}

async function loadExportPrefsForUser(user) {
  if (user?.clinicId) {
    const clinic = await Clinic.findById(user.clinicId).select("name doctorName address exportPrefs").lean();
    return {
      hasClinic: true,
      clinicName: clinic?.name || "",
      doctorName: clinic?.doctorName || "",
      clinicAddress: clinic?.address || "",
      ...normalizeExportPrefs(clinic?.exportPrefs)
    };
  }
  const setting = await Setting.findOne({ key: "exportPrefs" }).lean();
  return {
    hasClinic: false,
    clinicName: "",
    doctorName: "",
    clinicAddress: "",
    ...normalizeExportPrefs(setting?.value)
  };
}

async function saveExportPrefsForUser(user, body) {
  const prefs = normalizeExportPrefs(body);
  const profile = {
    name: typeof body.clinicName === "string" ? body.clinicName.trim() : undefined,
    doctorName: typeof body.doctorName === "string" ? body.doctorName.trim() : undefined,
    address: typeof body.clinicAddress === "string" ? body.clinicAddress.trim() : undefined
  };

  if (user?.clinicId) {
    const update = { exportPrefs: prefs };
    if (profile.name !== undefined) update.name = profile.name;
    if (profile.doctorName !== undefined) update.doctorName = profile.doctorName;
    if (profile.address !== undefined) update.address = profile.address;
    const clinic = await Clinic.findByIdAndUpdate(user.clinicId, update, { new: true });
    return {
      hasClinic: true,
      clinicName: clinic?.name || "",
      doctorName: clinic?.doctorName || "",
      clinicAddress: clinic?.address || "",
      ...normalizeExportPrefs(clinic?.exportPrefs)
    };
  }

  const setting = await Setting.findOneAndUpdate(
    { key: "exportPrefs" },
    { value: prefs },
    { new: true, upsert: true }
  );
  return {
    hasClinic: false,
    clinicName: "",
    doctorName: "",
    clinicAddress: "",
    ...normalizeExportPrefs(setting?.value)
  };
}

module.exports = {
  DEFAULT_EXPORT_PREFS,
  normalizeExportPrefs,
  applyExportPrefsToValues,
  loadExportPrefsForUser,
  saveExportPrefsForUser
};
