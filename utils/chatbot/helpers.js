const { FORM_LABELS } = require("../../data/chatbotKnowledge");

const PT_ID_REGEX = /\bPT-\d{4}-\d+\b/i;

/** Context follow-up — whose ID / which ID / explain last lookup */
const CONTEXT_FOLLOWUP_PATTERNS = [
  /whose\s+id/i,
  /which\s+id/i,
  /who'?s\s+id/i,
  /what\s+is\s+this\s+id/i,
  /this\s+id\s+(belong|kiska|konu|kono)/i,
  /ye\s+id\s+(kiska|kis\s+ka)/i,
  /aa\s+id\s+(konu|kono|kya)/i,
  /id\s+kiska/i,
  /id\s+konu/i,
  /konu\s+chhe\s+aa\s+id/i,
  /explain\s+(this|last|that)\s+(result|patient|lookup)/i,
  /who\s+did\s+you\s+find/i,
  /who\s+was\s+that/i,
  /ye\s+kaun\s+hai/i,
  /aa\s+kon\s+chhe/i
];

function isContextFollowUp(message) {
  const m = String(message).trim();
  return CONTEXT_FOLLOWUP_PATTERNS.some((p) => p.test(m));
}

function extractPatientIdFromText(text) {
  const match = String(text).match(PT_ID_REGEX);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Parse recent chat history for PT IDs or patient names from bot replies.
 */
function extractIdsFromHistory(history) {
  const ids = [];
  if (!Array.isArray(history)) return ids;
  for (const item of history.slice(-8)) {
    const id = extractPatientIdFromText(item?.text || "");
    if (id) ids.push(id);
  }
  return ids;
}

function buildContextFollowUpReply(lastPatient, replyLang) {
  const t = (en, hi, gu) =>
    replyLang === "hi" ? hi : replyLang === "gu" ? gu : en;

  if (!lastPatient) {
    return t(
      "🔍 I don't have a recent lookup. Search first — e.g. *PT-2026-1292* or *Find Ramesh Patel* — then ask *Whose ID is this?*",
      "🔍 मेरे पास हाल की खोज नहीं है। पहले खोजें — *PT-2026-1292* या *Find Ramesh Patel* — फिर पूछें *Ye ID kiska hai?*",
      "🔍 મારી પાસે તાજેતરની શોધ નથી. પહેલા શોધો — *PT-2026-1292* અથવા *Find Ramesh Patel* — પછી *Aa ID konu chhe?* પૂછો."
    );
  }

  const p = lastPatient;
  return t(
    `🆔 That ID belongs to:\n• Name: *${p.name}*\n• Patient ID: *${p.patientId}*\n• Company: ${p.company || "—"}\n• Emp Code: ${p.employeeCode || "—"}\n• Age/Gender: ${p.age ?? "—"} / ${p.gender || "—"}`,
    `🆔 यह ID इसका है:\n• नाम: *${p.name}*\n• Patient ID: *${p.patientId}*\n• कंपनी: ${p.company || "—"}\n• Emp Code: ${p.employeeCode || "—"}\n• उम्र/लिंग: ${p.age ?? "—"} / ${p.gender || "—"}`,
    `🆔 આ ID આનો છે:\n• નામ: *${p.name}*\n• Patient ID: *${p.patientId}*\n• કંપની: ${p.company || "—"}\n• Emp Code: ${p.employeeCode || "—"}\n• ઉંમર/લિંગ: ${p.age ?? "—"} / ${p.gender || "—"}`
  );
}

function detectInputLang(message) {
  if (/[\u0A80-\u0AFF]/.test(message)) return "gu";
  if (/[\u0900-\u097F]/.test(message)) return "hi";
  if (/\b(kitne|kaun|kya|hain|hai|mein|mahila|purush)\b/i.test(message)) return "hi";
  if (/\b(ketla|kyan|chhe|kon|kona|ketli)\b/i.test(message)) return "gu";
  return "en";
}

function normalizeReplyLang(lang) {
  if (lang === "hi" || lang === "gu" || lang === "en") return lang;
  return "en";
}

module.exports = {
  FORM_LABELS,
  PT_ID_REGEX,
  isContextFollowUp,
  extractPatientIdFromText,
  extractIdsFromHistory,
  buildContextFollowUpReply,
  detectInputLang,
  normalizeReplyLang
};
