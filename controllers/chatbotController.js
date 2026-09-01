const Patient = require("../models/Patient");
const { matchKnowledge, getKnowledgeAnswer, FORM_LABELS } = require("../data/chatbotKnowledge");
const { clinicScopeFilter } = require("../utils/tenant");
const {
  isContextFollowUp,
  extractPatientIdFromText,
  extractIdsFromHistory,
  buildContextFollowUpReply,
  detectInputLang,
  normalizeReplyLang
} = require("../utils/chatbot/helpers");
const {
  extractLookupToken,
  lookupFlexible,
  buildFlexibleLookupReply
} = require("../utils/chatbot/lookup");

// ─────────────────────────────────────────────────────────────────────────────
// INTENT + ENTITY DETECTION (data queries)
// ─────────────────────────────────────────────────────────────────────────────
function detectIntent(msg) {
  const m = msg.trim();
  const lower = m.toLowerCase();

  // Patient ID first (high precision)
  const ptIdMatch = m.match(/\bPT-\d{4}-\d+\b/i);
  if (ptIdMatch) {
    return { intent: "lookupByPatientId", entity: ptIdMatch[0].toUpperCase() };
  }

  // Total count (before generic numbers)
  if (/total|kitne (log|patient|dardi)|how many (total|patient)|ketla (dardi|log|patient)|sabhi patient/.test(lower)) {
    if (!/company|compan|firm|adani|tata|l&t|lnt|aster|reliance|airport|cargo/.test(lower)) {
      return { intent: "totalCount", entity: null };
    }
  }

  // Gender
  if (/(mahila|female|women|stri|striyo|ladies)/.test(lower)) {
    return { intent: "countByGender", entity: "Female" };
  }
  if (/(male|purush|aadmi|purus)(?!\s*patient)/.test(lower) && /(kitne|how many|ketla|count|total)/.test(lower)) {
    return { intent: "countByGender", entity: "Male" };
  }
  if (/^(male|purush|female|mahila)$/i.test(lower.trim())) {
    return { intent: "countByGender", entity: /female|mahila/i.test(lower) ? "Female" : "Male" };
  }

  // FIT / UNFIT
  if (/(fit|unfit)/.test(lower) && /(kitne|how many|ketla|count|total)/.test(lower)) {
    const status = /unfit/.test(lower) ? "UNFIT" : "FIT";
    return { intent: "countByFit", entity: status };
  }

  // Mobile (10 digit Indian)
  const mobileMatch = m.match(/\b[6-9]\d{9}\b/);
  if (mobileMatch) {
    return { intent: "lookupByMobile", entity: mobileMatch[0] };
  }

  // Employee code — keyword (1–12 chars) or standalone 6–10 digits
  const empKeywordMatch =
    m.match(/\b(?:emp(?:loyee)?)\s*(?:id|code|no|number)?[\s:#-]*([A-Z0-9]{1,12})\b/i) ||
    m.match(/\b(?:emp|employee)\s+([A-Z0-9]{1,12})\b/i);
  if (empKeywordMatch) {
    return { intent: "lookupByEmpCode", entity: empKeywordMatch[1] || empKeywordMatch[2] };
  }
  if (/^\d{6,10}$/.test(m.trim())) {
    return { intent: "lookupByEmpCode", entity: m.trim() };
  }

  // Company count
  const companyCountMatch =
    lower.match(/(?:kitne|how many|count|total|ketla).*?(?:from|mein|in|ma)\s+["']?([a-z0-9.\-& ()]{2,40})["']?/i) ||
    lower.match(/["']?([a-z0-9.\-& ()]{2,40})["']?\s+(?:company|firm|mein|ma|in|se|na)\s+(?:kitne|how many|ketla|log|patient|dardi|workers)/i) ||
    lower.match(/(?:company|firm)\s+["']?([a-z0-9.\-& ()]{2,40})["']?\s+(?:kitne|how many|ketla)/i);

  if (companyCountMatch) {
    const raw = companyCountMatch[1].trim();
    if (raw.length >= 2 && !/^(how|kitne|ketla|mein|from|in|the|a|is)$/i.test(raw)) {
      return { intent: "countByCompany", entity: raw };
    }
  }

  // List companies
  if (/(which companies|kaunsi company|companies list|list of company|sabhi company|list companies)/.test(lower)) {
    return { intent: "listCompanies", entity: null };
  }

  // Name lookup
  const nameLookupMatch =
    m.match(/(?:find|search|dhundho|shodhvanu|khojo|kaun hai|kon chhe|batao|who is)\s+["']?([A-Za-z\u0A80-\u0AFF\u0900-\u097F ]{2,50})["']?/i) ||
    m.match(/["']?([A-Za-z ]{2,50})["']?\s+(?:kaun hai|kon chhe|kyan chhe|kyay chhe|batao|nu id|ka id|no id)/i);
  if (nameLookupMatch) {
    const name = nameLookupMatch[1].trim();
    if (name.length >= 2 && !/^(the|a|is|mein|ka|ki|ke|total|how|what|which|jetbot|drsvl)$/i.test(name)) {
      return { intent: "lookupByName", entity: name };
    }
  }

  // Pending form
  const formPendingMatch = lower.match(
    /(?:pending|nahi kiya|nathi karyun|not done|incomplete|baaki|remaining).*?(?:form[- ]?(\w+)|(\w+)[- ]?form)/i
  );
  if (formPendingMatch) {
    const key = (formPendingMatch[1] || formPendingMatch[2] || "").toLowerCase();
    return { intent: "pendingForm", entity: key };
  }

  // Total fallback
  if (/(total|kitne|how many|ketla)/.test(lower)) {
    return { intent: "totalCount", entity: null };
  }

  return { intent: "unknown", entity: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// MONGO QUERIES
// ─────────────────────────────────────────────────────────────────────────────
async function executeQuery(intent, entity, clinicScope = {}) {
  switch (intent) {
    case "totalCount": {
      const count = await Patient.countDocuments(clinicScope);
      return { count };
    }
    case "countByGender": {
      const count = await Patient.countDocuments({ gender: entity, ...clinicScope });
      return { count, gender: entity };
    }
    case "countByFit": {
      const field = "forms.form33.data.fitStatus";
      const count = await Patient.countDocuments({ [field]: entity, ...clinicScope });
      return { count, status: entity };
    }
    case "lookupByPatientId": {
      const p = await Patient.findOne({ patientId: entity.toUpperCase(), ...clinicScope })
        .select("patientId name age gender company employeeCode mobile");
      return { patient: p };
    }
    case "lookupByEmpCode": {
      const p = await Patient.findOne({ employeeCode: entity, ...clinicScope })
        .select("patientId name age gender company employeeCode mobile");
      return { patient: p };
    }
    case "lookupByMobile": {
      const p = await Patient.findOne({ mobile: entity, ...clinicScope })
        .select("patientId name age gender company employeeCode mobile");
      return { patient: p };
    }
    case "lookupByName": {
      const patients = await Patient.find({ name: { $regex: entity, $options: "i" }, ...clinicScope })
        .select("patientId name age gender company employeeCode mobile")
        .limit(5)
        .lean();
      return { patients };
    }
    case "countByCompany": {
      const count = await Patient.countDocuments({ company: { $regex: entity, $options: "i" }, ...clinicScope });
      const sample = await Patient.findOne({ company: { $regex: entity, $options: "i" }, ...clinicScope })
        .select("company")
        .lean();
      return { count, company: sample?.company || entity };
    }
    case "listCompanies": {
      const companies = await Patient.distinct("company", { ...clinicScope, company: { $nin: [null, ""] } });
      return { companies: companies.filter(Boolean).sort() };
    }
    case "pendingForm": {
      const allFormKeys = Object.keys(FORM_LABELS);
      const matchedKey = allFormKeys.find(
        (k) =>
          k.toLowerCase().includes(entity) ||
          entity.includes(k.toLowerCase().replace(/[^a-z0-9]/g, ""))
      );
      if (!matchedKey) return { pendingFormKey: entity, patients: [], error: "unknownForm" };
      const patients = await Patient.find({ [`forms.${matchedKey}`]: { $exists: false }, ...clinicScope })
        .select("patientId name company")
        .limit(10)
        .lean();
      const total = await Patient.countDocuments({ [`forms.${matchedKey}`]: { $exists: false }, ...clinicScope });
      return {
        pendingFormKey: matchedKey,
        formLabel: FORM_LABELS[matchedKey],
        patients,
        total
      };
    }
    default:
      return {};
  }
}

function maskMobile(mob) {
  if (!mob || mob.length < 6) return mob || "N/A";
  return mob.slice(0, 2) + "****" + mob.slice(-4);
}

function patientLine(p) {
  return `${p.name} (${p.patientId}${p.company ? ` · ${p.company}` : ""}${p.employeeCode ? ` · Emp: ${p.employeeCode}` : ""})`;
}

function patientToContext(p) {
  if (!p) return null;
  return {
    patientId: p.patientId,
    name: p.name,
    age: p.age,
    gender: p.gender,
    company: p.company,
    employeeCode: p.employeeCode,
    mobile: p.mobile
  };
}

function buildDataReply(intent, data, replyLang) {
  const t = (en, hi, gu) => (replyLang === "hi" ? hi : replyLang === "gu" ? gu : en);
  const sorry = t(
    "Sorry, I couldn't find that information.",
    "माफ करें, वह जानकारी नहीं मिली।",
    "માફ કરો, તે માહિતી મળી નહીં."
  );

  switch (intent) {
    case "totalCount":
      return t(
        `📊 Total patients registered: *${data.count}*`,
        `📊 कुल रजिस्टर्ड मरीज़: *${data.count}*`,
        `📊 કુલ નોંધાયેલ દર્દીઓ: *${data.count}*`
      );
    case "countByGender": {
      const g = t(
        data.gender,
        data.gender === "Female" ? "महिला" : "पुरुष",
        data.gender === "Female" ? "સ્ત્રી" : "પુરુષ"
      );
      return t(
        `👥 ${g} patients: *${data.count}*`,
        `👥 ${g} मरीज़: *${data.count}*`,
        `👥 ${g} દર્દીઓ: *${data.count}*`
      );
    }
    case "countByFit":
      return t(
        `💊 ${data.status} workers (Form 33): *${data.count}*`,
        `💊 Form 33 में ${data.status}: *${data.count}*`,
        `💊 Form 33 માં ${data.status}: *${data.count}*`
      );
    case "lookupByPatientId":
    case "lookupByEmpCode":
    case "lookupByMobile": {
      const p = data.patient;
      if (!p) return sorry;
      return t(
        `🧑 Found!\n• Name: ${p.name}\n• ID: ${p.patientId}\n• Age: ${p.age}\n• Gender: ${p.gender}\n• Company: ${p.company || "—"}\n• Emp Code: ${p.employeeCode || "—"}\n• Mobile: ${maskMobile(p.mobile)}`,
        `🧑 मिल गया!\n• नाम: ${p.name}\n• ID: ${p.patientId}\n• उम्र: ${p.age}\n• लिंग: ${p.gender}\n• कंपनी: ${p.company || "—"}\n• Emp Code: ${p.employeeCode || "—"}\n• मोबाइल: ${maskMobile(p.mobile)}`,
        `🧑 મળ્યો!\n• નામ: ${p.name}\n• ID: ${p.patientId}\n• ઉંમર: ${p.age}\n• લિંગ: ${p.gender}\n• કંપની: ${p.company || "—"}\n• Emp Code: ${p.employeeCode || "—"}\n• મોબાઇલ: ${maskMobile(p.mobile)}`
      );
    }
    case "lookupByName": {
      const { patients } = data;
      if (!patients?.length) return sorry;
      const lines = patients.map(patientLine).join("\n• ");
      const more = t("(showing top 5)", "(शीर्ष 5)", "(ટોચ 5)");
      return t(
        `🔍 Found ${patients.length} match(es)${patients.length === 5 ? ` ${more}` : ""}:\n• ${lines}`,
        `🔍 ${patients.length} मरीज़ मिले${patients.length === 5 ? ` ${more}` : ""}:\n• ${lines}`,
        `🔍 ${patients.length} દર્દી મળ્યા${patients.length === 5 ? ` ${more}` : ""}:\n• ${lines}`
      );
    }
    case "countByCompany":
      return t(
        `🏢 *${data.company}*: ${data.count} patient(s)`,
        `🏢 *${data.company}* में: *${data.count}* मरीज़`,
        `🏢 *${data.company}* માં: *${data.count}* દર્દી`
      );
    case "listCompanies": {
      const { companies } = data;
      if (!companies?.length) return sorry;
      const list = companies.slice(0, 15).join("\n• ");
      const extra =
        companies.length > 15
          ? t(` ...and ${companies.length - 15} more`, ` ...और ${companies.length - 15}`, ` ...અને ${companies.length - 15} વધુ`)
          : "";
      return t(
        `🏢 Companies (${companies.length} total):\n• ${list}${extra}`,
        `🏢 कंपनियाँ (कुल ${companies.length}):\n• ${list}${extra}`,
        `🏢 કંપનીઓ (કુલ ${companies.length}):\n• ${list}${extra}`
      );
    }
    case "pendingForm": {
      if (data.error === "unknownForm") {
        return t(
          `❓ Form not recognised. Try: form33, healthRegister, preMedical, xrayReport, etc.`,
          `❓ फॉर्म नहीं पहचाना। जैसे: form33, healthRegister, preMedical`,
          `❓ ફોર્મ ઓળખ્યું નહીં. જેમ કે: form33, healthRegister, preMedical`
        );
      }
      const { formLabel, patients, total } = data;
      if (total === 0) {
        return t(
          `✅ All patients completed *${formLabel}*!`,
          `✅ सभी ने *${formLabel}* भर दिया!`,
          `✅ બધાએ *${formLabel}* ભરી દીધો!`
        );
      }
      const sample = patients.map((p) => `${p.name} (${p.patientId})`).join("\n• ");
      return t(
        `⏳ *${formLabel}* pending for *${total}* patient(s):\n• ${sample}${total > 10 ? `\n...and ${total - 10} more` : ""}`,
        `⏳ *${formLabel}* बाकी — *${total}* मरीज़:\n• ${sample}${total > 10 ? `\n...और ${total - 10}` : ""}`,
        `⏳ *${formLabel}* બાકી — *${total}* દર્દી:\n• ${sample}${total > 10 ? `\n...અને ${total - 10}` : ""}`
      );
    }
    default:
      return t(
        "🤔 I didn't understand that. Type *help* for examples, or use the language switch above.",
        "🤔 समझ नहीं आया। *help* टाइप करें या ऊपर भाषा बदलें।",
        "🤔 સમજ ન પડ્યું. *help* ટાઇપ કરો અથવા ઉપર ભાષા બદલો."
      );
  }
}

function buildContextUpdate(intent, data) {
  if (
    intent === "lookupByPatientId" ||
    intent === "lookupByEmpCode" ||
    intent === "lookupByMobile" ||
    intent === "lookupFlexible"
  ) {
    return patientToContext(data.patient);
  }
  if (intent === "lookupByName" && data.patients?.length === 1) {
    return patientToContext(data.patients[0]);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chatbot/query
// Body: { message, replyLang?: 'en'|'hi'|'gu', context?: { lastPatient }, history?: [] }
// ─────────────────────────────────────────────────────────────────────────────
exports.query = async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();
    if (!message) {
      return res.status(400).json({ reply: "Please send a message." });
    }

    const replyLang = normalizeReplyLang(req.body.replyLang || detectInputLang(message));
    const context = req.body.context || {};
    const history = req.body.history || [];

    let intent = "faq";
    let reply;
    let contextUpdate = null;

    const clinicScope = clinicScopeFilter(req);

    // 1) Direct ID / emp code in message (emp id 21, whose id is 21, PT-2026-1292)
    const lookupToken = extractLookupToken(message);
    if (lookupToken) {
      intent = "lookupFlexible";
      const flexResult = await lookupFlexible(lookupToken, clinicScope);
      reply = buildFlexibleLookupReply(flexResult, lookupToken, replyLang);
      if (flexResult.patient) {
        contextUpdate = patientToContext(flexResult.patient);
      }
      return res.json({
        reply,
        intent,
        replyLang,
        inputLang: detectInputLang(message),
        contextUpdate
      });
    }

    // 2) Context follow-ups without embedded ID ("whose ID is this?")
    if (isContextFollowUp(message)) {
      intent = "contextFollowUp";
      let lastPatient = context.lastPatient;

      if (!lastPatient) {
        const historyIds = extractIdsFromHistory(history);
        const idFromMsg = extractPatientIdFromText(message);
        const targetId = idFromMsg || historyIds[historyIds.length - 1];
        if (targetId) {
          const p = await Patient.findOne({ patientId: targetId, ...clinicScope })
            .select("patientId name age gender company employeeCode mobile");
          lastPatient = patientToContext(p);
        }
      }

      reply = buildContextFollowUpReply(lastPatient, replyLang);
      contextUpdate = lastPatient;
      return res.json({ reply, intent, replyLang, inputLang: detectInputLang(message), contextUpdate });
    }

    // 3) Knowledge base FAQ
    const faq = matchKnowledge(message);
    if (faq) {
      intent = `faq:${faq.id}`;
      reply = getKnowledgeAnswer(faq, replyLang);
      return res.json({ reply, intent, replyLang, inputLang: detectInputLang(message), contextUpdate: null });
    }

    // 4) Live database intents
    const detected = detectIntent(message);
    intent = detected.intent;
    const data = await executeQuery(intent, detected.entity, clinicScope);
    reply = buildDataReply(intent, data, replyLang);
    contextUpdate = buildContextUpdate(intent, data);

    return res.json({
      reply,
      intent,
      replyLang,
      inputLang: detectInputLang(message),
      contextUpdate
    });
  } catch (err) {
    console.error("[JetBot] Error:", err.message);
    return res.status(500).json({ reply: "Server error while processing your query." });
  }
};
