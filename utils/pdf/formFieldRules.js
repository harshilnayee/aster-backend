const path = require("path");
const Clinic = require("../../models/Clinic");
const Setting = require("../../models/Setting");
const catalog = require("../../config/formFieldCatalog.json");
const formRegistry = require("../../config/formRegistry.json");

const FORM_KEY_TO_FILL_ID = {
  preMedical: "1-form-personal-details",
  postMedical: "22-form-post-medical",
  eyeExam: "eyeExam",
  form33: "form33",
  healthRegister: "healthRegister",
  xrayReport: "xrayReport"
};

const MODES = new Set(["exam", "default", "permanent", "blank"]);
const SKIP_CATALOG = /strike|crossMale|crossFemale|DefaultStrike/i;
const EXTRA_PDF = /doctor|stamp|sign|certified|verified|officer|fitStatus|remark|seal/i;

function labelForField(key) {
  return String(key)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function loadCoordKeys(formKey) {
  const fillId = FORM_KEY_TO_FILL_ID[formKey] || formKey;
  if (!fillId) return [];
  const entry = formRegistry[fillId];
  const file = entry?.coordinatesFile;
  if (!file) return [];
  try {
    const coords = require(path.join(__dirname, "../../config/form-coordinates", file));
    return Object.keys(coords || {}).filter((k) => EXTRA_PDF.test(k) && !SKIP_CATALOG.test(k));
  } catch {
    return [];
  }
}

function getFieldCatalog(formKey) {
  const fromForm = catalog[formKey] || [];
  const extra = loadCoordKeys(formKey);
  const keys = [...new Set([...fromForm, ...extra])].filter((k) => k && k !== "data");
  return keys.map((key) => ({ key, label: labelForField(key) }));
}

function normalizeRule(raw) {
  if (!raw || typeof raw !== "object") return { mode: "exam", value: "" };
  const mode = MODES.has(raw.mode) ? raw.mode : "exam";
  return {
    mode,
    value: raw.value == null ? "" : String(raw.value)
  };
}

function normalizeFormRules(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [key, rule] of Object.entries(raw)) {
    if (!key || key === "data") continue;
    const next = normalizeRule(rule);
    if (next.mode === "exam" && !next.value) continue;
    out[key] = next;
  }
  return out;
}

function normalizeAllRules(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [formKey, rules] of Object.entries(raw)) {
    out[formKey] = normalizeFormRules(rules);
  }
  return out;
}

function applyFormFieldRules(obj, rules, { persist = false } = {}) {
  if (!obj || typeof obj !== "object" || !rules) return obj;
  const out = { ...obj };
  for (const [key, rule] of Object.entries(rules)) {
    if (!rule) continue;
    if (rule.mode === "blank") {
      out[key] = "";
      continue;
    }
    if (rule.mode === "permanent") {
      out[key] = rule.value ?? "";
      continue;
    }
    if (!persist && rule.mode === "default") {
      if (out[key] === undefined || out[key] === null || out[key] === "") {
        out[key] = rule.value ?? "";
      }
    }
  }
  return out;
}

async function loadAllFormFieldRules(user) {
  if (user?.clinicId) {
    const clinic = await Clinic.findById(user.clinicId).select("formFieldRules").lean();
    return normalizeAllRules(clinic?.formFieldRules);
  }
  const setting = await Setting.findOne({ key: "formFieldRules" }).lean();
  return normalizeAllRules(setting?.value);
}

async function loadFormFieldRules(user, formKey) {
  const all = await loadAllFormFieldRules(user);
  return all[formKey] || {};
}

async function saveFormFieldRules(user, formKey, rules) {
  const nextRules = normalizeFormRules(rules);
  if (user?.clinicId) {
    const clinic = await Clinic.findById(user.clinicId).select("formFieldRules");
    if (clinic) {
      const all = normalizeAllRules(clinic.formFieldRules);
      all[formKey] = nextRules;
      clinic.formFieldRules = all;
      clinic.markModified("formFieldRules");
      await clinic.save();
      return nextRules;
    }
  }
  const existing = await Setting.findOne({ key: "formFieldRules" }).lean();
  const all = normalizeAllRules(existing?.value);
  all[formKey] = nextRules;
  await Setting.findOneAndUpdate(
    { key: "formFieldRules" },
    { value: all },
    { upsert: true }
  );
  return nextRules;
}

module.exports = {
  getFieldCatalog,
  normalizeFormRules,
  applyFormFieldRules,
  loadAllFormFieldRules,
  loadFormFieldRules,
  saveFormFieldRules
};
