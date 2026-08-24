const Clinic = require("../models/Clinic");
const Setting = require("../models/Setting");
const SEED = require("../config/prescriptionLexiconSeed.json");

const SETTING_KEY = "prescriptionLexicon";
const MAX_WORDS = 2500;

function normalizeWords(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const word = String(raw || "").replace(/\s+/g, " ").trim();
    if (!word || word.length > 48) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out.slice(0, MAX_WORDS);
}

function parseBodyWords(body) {
  if (Array.isArray(body?.words)) return normalizeWords(body.words);
  if (typeof body?.text === "string") {
    return normalizeWords(body.text.split(/[\n,;]+/));
  }
  return [];
}

async function loadPrescriptionLexicon(user) {
  const seed = normalizeWords(SEED);
  if (user?.clinicId) {
    const clinic = await Clinic.findById(user.clinicId).select("prescriptionLexicon");
    if (!clinic) return seed;
    if (!Array.isArray(clinic.prescriptionLexicon) || clinic.prescriptionLexicon.length === 0) {
      clinic.prescriptionLexicon = seed;
      clinic.markModified("prescriptionLexicon");
      await clinic.save();
      return seed;
    }
    return normalizeWords(clinic.prescriptionLexicon);
  }

  const existing = await Setting.findOne({ key: SETTING_KEY }).lean();
  if (!Array.isArray(existing?.value) || existing.value.length === 0) {
    const setting = await Setting.findOneAndUpdate(
      { key: SETTING_KEY },
      { value: seed },
      { upsert: true, new: true }
    );
    return normalizeWords(setting.value);
  }
  return normalizeWords(existing.value);
}

async function savePrescriptionLexicon(user, incoming, { merge = false } = {}) {
  const next = normalizeWords(incoming);
  const current = merge ? await loadPrescriptionLexicon(user) : [];
  const words = normalizeWords([...current, ...next]);

  if (user?.clinicId) {
    const clinic = await Clinic.findById(user.clinicId);
    if (!clinic) {
      await Setting.findOneAndUpdate(
        { key: SETTING_KEY },
        { value: words },
        { upsert: true, new: true }
      );
      return words;
    }
    clinic.prescriptionLexicon = words;
    clinic.markModified("prescriptionLexicon");
    await clinic.save();
    return words;
  }

  await Setting.findOneAndUpdate(
    { key: SETTING_KEY },
    { value: words },
    { upsert: true, new: true }
  );
  return words;
}

module.exports = {
  normalizeWords,
  parseBodyWords,
  loadPrescriptionLexicon,
  savePrescriptionLexicon,
  SEED_COUNT: normalizeWords(SEED).length
};
