const Patient = require("../../models/Patient");

const PATIENT_SELECT = "patientId name age gender company employeeCode mobile";

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PT_ID_REGEX = /\bPT-\d{4}-\d+\b/i;

/**
 * Extract an ID token from natural language (emp id 21, whose id is 21, PT-2026-1292).
 */
function extractLookupToken(message) {
  const m = String(message).trim();

  const fullPt = m.match(PT_ID_REGEX);
  if (fullPt) return fullPt[0].toUpperCase();

  const patterns = [
    /\b(?:whose|which|who'?s)\s+id\s+(?:is\s+)?([A-Z0-9]{1,12})\b/i,
    /\b(?:emp(?:loyee)?)\s*(?:id|code|no|number)?[\s:#-]*([A-Z0-9]{1,12})\b/i,
    /\b(?:patient\s*)?id[\s:#-]+([A-Z0-9]{1,12})\b/i,
    /\bpt[\s:#-]+(\d{1,6})\b/i
  ];

  for (const pattern of patterns) {
    const match = m.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

/**
 * Try employee code, patient ID suffix, and partial matches for short IDs like "21".
 */
async function lookupFlexible(token, clinicScope = {}) {
  const raw = String(token).trim();
  if (!raw) return { patient: null };

  if (/^PT-/i.test(raw)) {
    const patient = await Patient.findOne({ patientId: raw.toUpperCase(), ...clinicScope }).select(PATIENT_SELECT);
    return { patient, matchType: "patientId" };
  }

  // Exact employee code (string field — works for "21", "10187398", etc.)
  let patient = await Patient.findOne({ employeeCode: raw, ...clinicScope }).select(PATIENT_SELECT);
  if (patient) return { patient, matchType: "employeeCode" };

  patient = await Patient.findOne({
    employeeCode: { $regex: `^${escapeRegex(raw)}$`, $options: "i" },
    ...clinicScope
  }).select(PATIENT_SELECT);
  if (patient) return { patient, matchType: "employeeCode" };

  // Patient ID suffix: PT-2026-21, PT-2026-0021
  if (/^\d+$/.test(raw)) {
    const suffix = raw.replace(/^0+/, "") || raw;
    const bySuffix = await Patient.find({
      patientId: { $regex: `-0*${escapeRegex(suffix)}$`, $options: "i" },
      ...clinicScope
    })
      .select(PATIENT_SELECT)
      .limit(6)
      .lean();

    if (bySuffix.length === 1) {
      return { patient: bySuffix[0], matchType: "patientSuffix" };
    }
    if (bySuffix.length > 1) {
      return { patients: bySuffix, matchType: "multiplePatientSuffix" };
    }
  }

  // Partial employee code (e.g. ends with 21)
  const byEmpPartial = await Patient.find({
    employeeCode: { $regex: escapeRegex(raw), $options: "i" },
    ...clinicScope
  })
    .select(PATIENT_SELECT)
    .limit(6)
    .lean();

  if (byEmpPartial.length === 1) {
    return { patient: byEmpPartial[0], matchType: "employeeCodePartial" };
  }
  if (byEmpPartial.length > 1) {
    return { patients: byEmpPartial, matchType: "multipleEmployeeCode" };
  }

  return { patient: null };
}

function patientLine(p) {
  return `${p.name} (${p.patientId}${p.employeeCode ? ` · Emp: ${p.employeeCode}` : ""}${p.company ? ` · ${p.company}` : ""})`;
}

function buildFlexibleLookupReply(result, token, replyLang) {
  const t = (en, hi, gu) => (replyLang === "hi" ? hi : replyLang === "gu" ? gu : en);
  const sorry = t(
    `No patient found for ID/code *${token}*. Try full *PT-2026-XXXX* or employee code.`,
    `*${token}* के लिए कोई मरीज़ नहीं मिला। पूरा *PT-2026-XXXX* या employee code दें।`,
    `*${token}* માટે દર્દી મળ્યો નહીં. પૂરું *PT-2026-XXXX* અથવા employee code આપો.`
  );

  if (result.patient) {
    const p = result.patient;
    const matchNote = t(
      result.matchType === "employeeCode" || result.matchType === "employeeCodePartial"
        ? `(matched employee code)`
        : result.matchType === "patientSuffix"
          ? `(matched patient ID suffix)`
          : "",
      result.matchType === "employeeCode" || result.matchType === "employeeCodePartial"
        ? `(employee code से मिला)`
        : result.matchType === "patientSuffix"
          ? `(patient ID suffix से मिला)`
          : "",
      result.matchType === "employeeCode" || result.matchType === "employeeCodePartial"
        ? `(employee code થી મળ્યો)`
        : result.matchType === "patientSuffix"
          ? `(patient ID suffix થી મળ્યો)`
          : ""
    );

    return t(
      `🧑 Found! ${matchNote}\n• Name: ${p.name}\n• Patient ID: ${p.patientId}\n• Age: ${p.age ?? "—"}\n• Gender: ${p.gender || "—"}\n• Company: ${p.company || "—"}\n• Emp Code: ${p.employeeCode || "—"}`,
      `🧑 मिल गया! ${matchNote}\n• नाम: ${p.name}\n• Patient ID: ${p.patientId}\n• उम्र: ${p.age ?? "—"}\n• लिंग: ${p.gender || "—"}\n• कंपनी: ${p.company || "—"}\n• Emp Code: ${p.employeeCode || "—"}`,
      `🧑 મળ્યો! ${matchNote}\n• નામ: ${p.name}\n• Patient ID: ${p.patientId}\n• ઉંમર: ${p.age ?? "—"}\n• લિંગ: ${p.gender || "—"}\n• કંપની: ${p.company || "—"}\n• Emp Code: ${p.employeeCode || "—"}`
    );
  }

  if (result.patients?.length) {
    const lines = result.patients.map(patientLine).join("\n• ");
    return t(
      `🔍 *${token}* matches ${result.patients.length} patient(s):\n• ${lines}\n\nUse full *PT-2026-XXXX* for exact match.`,
      `🔍 *${token}* से ${result.patients.length} मरीज़:\n• ${lines}\n\nसटीक खोज के लिए *PT-2026-XXXX* दें।`,
      `🔍 *${token}* થી ${result.patients.length} દર્દી:\n• ${lines}\n\nચોક્કસ શોધ માટે *PT-2026-XXXX* આપો.`
    );
  }

  return sorry;
}

module.exports = {
  extractLookupToken,
  lookupFlexible,
  buildFlexibleLookupReply,
  escapeRegex,
  PT_ID_REGEX
};
