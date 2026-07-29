const { calculateAfterPulse, calculateAfterBp } = require("./afterVitals");
const { decrypt } = require("../encryption");

/**
 * Maps client form keys → pdf-lib fill registry IDs.
 * null = not supported by fast server bulk export
 * (Post Medical is HTML-only — coordinate file is empty).
 */
const FORM_KEY_TO_FILL_ID = {
  preMedical: "1-form-personal-details",
  postMedical: null, // HTML template only; coords file is {}
  eyeExam: "eyeExam",
  form33: "form33",
  healthRegister: "healthRegister",
  xrayReport: "xrayReport",
  "4-form-airport-bohw": "4-form-airport-bohw",
  "5-form-height-pass": "5-form-height-pass",
  "10-form-ophthal-form-6": "10-form-ophthal-form-6",
  "11-form-audiometry-front": "11-form-audiometry-front",
  "12-form-audiometry-back": "12-form-audiometry-back",
  "13-form-pft-front": "13-form-pft-front",
  "14-form-pft-back": "14-form-pft-back",
  "15-form-vaccination-front": "15-form-vaccination-front",
  "16-form-vaccination-back": "16-form-vaccination-back",
  "17-form-food-handler-certificate": "17-form-food-handler-certificate",
  "18-form-vaccine-ircs-forms-2": "18-form-vaccine-ircs-forms-2",
  "19-form-ecg": "19-form-ecg",
  "25-form-for-medical-fitness-certificate-format": "25-form-for-medical-fitness-certificate-format",
  "26-form-death-certificate": "26-form-death-certificate",
  "35-form-airport-bohw-ht-front": "35-form-airport-bohw-ht-front",
  "36-form-airport-bohw-ht-back": "36-form-airport-bohw-ht-back"
};

function formatDateDMY(val) {
  if (val === undefined || val === null || val === "") return "";
  // Native Date from Mongo lean()
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(val);
  }
  const s = String(val).trim();
  if (!s) return "";
  // Already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  // ISO / YYYY-MM-DD (with optional time part)
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  // Full JS Date string / other parseable dates — format in IST
  try {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }).format(d);
    }
  } catch {
    // ignore
  }
  return "";
}

function normalizeSex(raw) {
  const s = String(raw || "").trim();
  if (!s || s === "Not Specified") return "Male";
  return s;
}

function dedupeAddress(str) {
  if (!str || typeof str !== "string") return "";
  const parts = str.split(",").map((p) => p.trim()).filter(Boolean);
  const uniqueParts = [];
  for (const part of parts) {
    if (!uniqueParts.some((u) => u.toLowerCase() === part.toLowerCase())) {
      uniqueParts.push(part);
    }
  }
  return uniqueParts.join(", ");
}

function splitAddress(fullAddress, maxLen = 55) {
  if (!fullAddress) return { residence: "", residence2: "" };
  if (fullAddress.length <= maxLen) {
    return { residence: fullAddress, residence2: "" };
  }
  const splitIndex = fullAddress.lastIndexOf(" ", maxLen);
  if (splitIndex !== -1 && splitIndex > 20) {
    return {
      residence: fullAddress.slice(0, splitIndex),
      residence2: fullAddress.slice(splitIndex).trim()
    };
  }
  return {
    residence: fullAddress.slice(0, maxLen),
    residence2: fullAddress.slice(maxLen).trim()
  };
}

function getPatientPermanentDate(patient) {
  if (!patient) return new Date().toISOString().split("T")[0];
  const forms = patient.forms || {};

  for (const formKey of Object.keys(forms)) {
    const data = forms[formKey]?.data || {};
    const d =
      data.date ||
      data.dateTop ||
      data.examinationDate ||
      data.examDate ||
      data.regDate ||
      data.certDate ||
      data.date1;
    if (d && typeof d === "string" && d.trim()) {
      const clean = d.split("T")[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    }
  }

  if (patient.examinationDate && typeof patient.examinationDate === "string") {
    const clean = patient.examinationDate.split("T")[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  }

  if (patient.createdAt) {
    try {
      const created = new Date(patient.createdAt).toISOString().split("T")[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(created)) return created;
    } catch {
      // ignore
    }
  }

  return new Date().toISOString().split("T")[0];
}

function getPreviousPulseAndBp(forms = {}) {
  const frontData = forms["35-form-airport-bohw-ht-front"]?.data || {};
  const airportData = forms["4-form-airport-bohw"]?.data || {};
  const preMedData = forms.preMedical?.data || {};
  const postMedData = forms.postMedical?.data || {};
  const personalData = forms["1-form-personal-details"]?.data || {};
  const htBackData = forms["36-form-airport-bohw-ht-back"]?.data || {};
  const hpData = forms["5-form-height-pass"]?.data || {};

  const pulse =
    frontData.pulse ||
    airportData.pulse ||
    preMedData.pulse ||
    postMedData.pulse ||
    personalData.pulse ||
    htBackData.beforePulseRate ||
    hpData.beforePulseRate ||
    "";

  const bp =
    frontData.bloodPressure ||
    frontData.bp ||
    airportData.bloodPressure ||
    airportData.bp ||
    preMedData.bp ||
    personalData.bp ||
    htBackData.beforeBp ||
    hpData.beforeBp ||
    "";

  return { pulse: String(pulse || ""), bp: String(bp || "") };
}

function cleanPulse(val) {
  if (!val) return "";
  const s = String(val).replace(/\/min/gi, "").trim();
  return s ? `${s} /min` : "";
}

function cleanBp(val) {
  if (!val) return "";
  const s = String(val).replace(/mmHg/gi, "").trim();
  return s ? `${s} mmHg` : "";
}

/** YES/NO/FIT stored values → "Yes" / "No" labels for PDF columns */
function yesNoLabel(val, defaultNo = true) {
  if (val === undefined || val === null || val === "") {
    return defaultNo ? "No" : "Yes";
  }
  const s = String(val).toUpperCase();
  if (s === "YES" || s === "Y" || s === "FIT" || s === "TRUE") return "Yes";
  if (s === "NO" || s === "N" || s === "UNFIT" || s === "FALSE") return "No";
  return defaultNo ? "No" : "Yes";
}

function fitStatusLabel(val) {
  if (!val) return "Yes";
  return String(val).toUpperCase() === "FIT" ? "Yes" : "No";
}

function buildHeightPassLikeValues(actualForm, patient) {
  const forms = patient.forms || {};
  const prevVitals = getPreviousPulseAndBp(forms);
  const permanentDate = getPatientPermanentDate(patient);

  const dateVal = actualForm.date || permanentDate;
  const dateStr = formatDateDMY(dateVal);

  const rawSex = String(actualForm.sex || patient.gender || "").trim().toLowerCase();
  const sexAbbrev = rawSex.startsWith("m") ? "M" : rawSex.startsWith("f") ? "F" : rawSex.toUpperCase();

  const beforePulseRate = actualForm.beforePulseRate || prevVitals.pulse || "";
  const seed = patient.patientId || patient.name || "";
  const afterPulseRate =
    actualForm.afterPulseRate || (beforePulseRate ? calculateAfterPulse(beforePulseRate, seed) : "");

  const beforeBpVal = actualForm.beforeBp || prevVitals.bp || "";
  const beforeBpParts = beforeBpVal.split("/");
  const beforeBpSys = beforeBpParts[0] ? beforeBpParts[0].trim() : "";
  const beforeBpDia = beforeBpParts[1] ? beforeBpParts[1].trim() : "";

  const afterBpVal = actualForm.afterBp || (beforeBpVal ? calculateAfterBp(beforeBpVal, seed) : "");
  const afterBpParts = afterBpVal.split("/");
  const afterBpSys = afterBpParts[0] ? afterBpParts[0].trim() : "";
  const afterBpDia = afterBpParts[1] ? afterBpParts[1].trim() : "";

  const yesNoFields = [
    "uncontrolledThoughts",
    "fearLosingControl",
    "fearFainting",
    "intenseFeelingComeDown",
    "worryUpcomingEvents",
    "palpitation",
    "dizziness",
    "chestPain",
    "shivering",
    "feelingChoking",
    "sweating",
    "nausea",
    "numbnessTugging",
    "flushes",
    "flatFoot",
    "criteriaMajorIllness",
    "criteriaEpilepsy",
    "criteriaVision",
    "criteriaAuditory",
    "criteriaLocomotor",
    "criteriaAnyOther"
  ];

  const yesDefaultFields = new Set([
    "criteriaBreathing",
    "criteriaUpperLimbs",
    "criteriaLowerLimbs",
    "criteriaStability"
  ]);

  const values = {
    date: dateStr,
    name: actualForm.name || patient.name || "",
    age: actualForm.age != null ? String(actualForm.age) : patient.age != null ? String(patient.age) : "",
    sex: sexAbbrev,
    mobileNo: actualForm.mobileNo || patient.mobile || "",
    companyName: actualForm.companyName || patient.company || "",
    idNo: actualForm.idNo || patient.employeeCode || patient.patientId || "",
    previousHistory: actualForm.previousHistory || "",
    beforePulseRate: cleanPulse(beforePulseRate),
    beforeBp: cleanBp(beforeBpVal),
    beforeBpSys,
    beforeBpDia,
    afterPulseRate: cleanPulse(afterPulseRate),
    afterBp: cleanBp(afterBpVal),
    afterBpSys,
    afterBpDia,
    fitStatus: fitStatusLabel(actualForm.fitStatus),
    remark: actualForm.remark || "",
    certifiedName: actualForm.certifiedName || patient.name || "",
    companyName2: actualForm.companyName || patient.company || "",
    fitWorkAt: actualForm.fitWorkAt || "",
    doctorName: actualForm.doctorName || "",
    doctorStamp: actualForm.doctorStamp || "",
    patientSignature: patient.signature || "",
    criteriaAnyOtherText: actualForm.criteriaAnyOtherText || ""
  };

  for (const field of yesNoFields) {
    values[field] = yesNoLabel(actualForm[field], true);
    values[`${field}Remark`] = actualForm[`${field}Remark`] || "";
  }

  for (const field of yesDefaultFields) {
    values[field] = yesNoLabel(actualForm[field], false);
    values[`${field}Remark`] = actualForm[`${field}Remark`] || "";
  }

  return values;
}

function buildAirportBohwValues(actualForm, patient) {
  const permanentDate = getPatientPermanentDate(patient);
  const dobRaw = actualForm.dob || patient.dob || "";
  const dobStr = formatDateDMY(dobRaw);
  const dateTopStr = formatDateDMY(actualForm.dateTop || permanentDate);

  const rawSerial = actualForm.certificateSerialNo || patient.patientId || "";
  const cleanSerial = rawSerial.startsWith("HT-") ? rawSerial.substring(3) : rawSerial;
  const sexVal = normalizeSex(actualForm.sex || patient.gender).toUpperCase();

  const fullAddress = dedupeAddress(actualForm.residence || patient.address || "");
  const { residence, residence2 } = splitAddress(fullAddress);

  const fmtUnit = (val, unit, stripRe) => {
    if (!val) return "";
    const n = String(val).replace(stripRe, "").trim();
    return n ? `${n} ${unit}` : String(val);
  };

  return {
    certificateSerialNo: cleanSerial,
    dateTop: dateTopStr,
    name: actualForm.name || patient.name || "",
    identificationMarks: actualForm.identificationMarks || "",
    fatherName: actualForm.fatherName || patient.fatherName || "",
    sex: sexVal,
    mobileNo: actualForm.mobileNo || patient.mobile || "",
    residence,
    residence2,
    dob: dobStr,
    aadharNo: actualForm.aadharNo || patient.govIdNumber || patient.aadharNo || "",
    height: fmtUnit(actualForm.height, "cm", /[^0-9.]/g),
    weight: fmtUnit(actualForm.weight, "kg", /[^0-9.]/g),
    bloodPressure: fmtUnit(actualForm.bloodPressure, "mmHg", /[^0-9/]/g),
    pulse: fmtUnit(actualForm.pulse, "/min", /[^0-9.]/g),
    hearing: (actualForm.hearing || "").toUpperCase(),
    refractiveError: (actualForm.refractiveError || "").toUpperCase(),
    colourVision: (actualForm.colourVision || "").toUpperCase(),
    anyDisability: (actualForm.anyDisability || "").toUpperCase(),
    armFunctionGrip: (actualForm.armFunctionGrip || "").toUpperCase(),
    legFootFunction: (actualForm.legFootFunction || "").toUpperCase(),
    varicose: (actualForm.varicose || "NO").toUpperCase(),
    seizure: (actualForm.seizure || "NO").toUpperCase(),
    vertigo: (actualForm.vertigo || "NO").toUpperCase(),
    acrophobia: (actualForm.acrophobia || "NO").toUpperCase(),
    diabetes: (actualForm.diabetes || "NO").toUpperCase(),
    stroke: (actualForm.stroke || "NO").toUpperCase(),
    heartDiseases: (actualForm.heartDiseases || "NO").toUpperCase(),
    majorIllnessOrSurgery: (actualForm.majorIllnessOrSurgery || "NO").toUpperCase(),
    symptomsVisible: (actualForm.symptomsVisible || "NO").toUpperCase(),
    othersIfAny:
      actualForm.othersIfAny && actualForm.othersIfAny !== "NA" && actualForm.othersIfAny !== "None"
        ? actualForm.othersIfAny.toUpperCase()
        : "NO REMARKS",
    remark:
      actualForm.remark && actualForm.remark !== "NA" && actualForm.remark !== "None"
        ? actualForm.remark.toUpperCase()
        : "NO REMARKS",
    residingAt: "As above ",
    fitForEmploymentIn: actualForm.fitForEmploymentIn || "",
    ascertainedAge: actualForm.ascertainedAge || "",
    fitStatus: actualForm.fitStatus || "FIT",
    reasonRefusal: actualForm.reasonRefusal || "No",
    reasonRevoked: actualForm.reasonRevoked || "Yes",
    companyName: actualForm.companyName || patient.company || "",
    patientSignature: patient.signature || "",
    doctorSignature: actualForm.doctorSignature || "",
    doctorStamp: actualForm.doctorStamp || "",
    crossAlwaysAge: "yes"
  };
}

function buildAirportBohwHtFrontValues(actualForm, patient) {
  const base = buildAirportBohwValues(actualForm, patient);
  const sexVal = normalizeSex(actualForm.sex || patient.gender);
  const isMale = sexVal.toLowerCase() === "male";
  const isFemale = sexVal.toLowerCase() === "female";

  const mobile = actualForm.mobileNo || patient.mobile || "";
  const mobileFormatted =
    mobile && !mobile.startsWith("+91") ? `+91 ${mobile}` : mobile;

  return {
    ...base,
    sex: sexVal.toUpperCase(),
    mobileNo: mobileFormatted,
    examinedPersonName: actualForm.name || patient.name || "",
    relativeName: actualForm.fatherName || patient.fatherName || "",
    employeeCode: actualForm.employeeCode || patient.employeeCode || "",
    department: actualForm.department || patient.department || "",
    designation: actualForm.designation || patient.occupation || "",
    ascertainedAge: actualForm.ascertainedAge || String(patient.age || ""),
    crossMale2: isMale ? "yes" : "",
    crossMale3: isMale ? "yes" : "",
    crossFemale2: isFemale ? "yes" : "",
    crossMale4: isMale ? "yes" : "",
    crossFemale3: isFemale ? "yes" : ""
  };
}

function applyCommonDefaults(data, patient) {
  const sexVal = normalizeSex(data.sex || patient.gender);
  if (!data.name) data.name = patient.name || "";
  if (data.age === undefined || data.age === null || data.age === "") {
    data.age = patient.age != null ? String(patient.age) : "";
  }
  if (!data.sex) data.sex = sexVal;
  if (!data.mobileNo) data.mobileNo = patient.mobile || "";
  if (!data.companyName) data.companyName = patient.company || "";
  if (!data.fatherName) data.fatherName = patient.fatherName || "";
  if (!data.patientSignature) data.patientSignature = patient.signature || "";

  for (const key of ["date", "dateTop", "dob", "examinationDate", "examDate", "regDate", "certDate"]) {
    if (data[key]) data[key] = formatDateDMY(data[key]);
  }

  return data;
}

function cleanAreaName(val) {
  const s = String(val || "").trim();
  if (!s) return "";
  if (/^(na|n\/a|none|-)$/i.test(s)) return "";
  if (/^s+$/i.test(s)) return "";
  return s;
}

function cleanAddressPart(val) {
  const s = String(val ?? "").trim();
  if (!s) return "";
  if (/^(na|n\/a|none|-)$/i.test(s)) return "";
  return s;
}

function addressPartFromForm(formVal, patientVal) {
  if (formVal !== undefined && formVal !== null) return cleanAddressPart(formVal);
  return cleanAddressPart(patientVal);
}

function buildForm33Values(actualForm, patient) {
  const fullAddress = addressPartFromForm(actualForm.residence, patient.address);
  const deduped = dedupeAddress(fullAddress);
  const { residence: r1, residence2: r2 } = splitAddress(deduped, 45);
  const genderLower = String(actualForm.sex || patient.gender || "").toLowerCase();
  const isFemale = genderLower.includes("female");
  const isUnfit = actualForm.fitStatus === "UNFIT";
  const isHazardous = String(actualForm.hazardousProcess || "").toLowerCase() === "yes";
  const isDangerous = String(actualForm.dangerousOperation || "").toLowerCase() === "yes";

  const examDateStr = formatDateDMY(
    actualForm.examinationDate || (actualForm.savedAt ? String(actualForm.savedAt).split("T")[0] : "")
  );
  let timeStr = "";
  const signDateToUse = actualForm.doctorSignatureDate;
  if (signDateToUse) {
    const d = new Date(signDateToUse);
    if (!Number.isNaN(d.getTime())) {
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12;
      hours = hours ? hours : 12;
      timeStr = `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
    }
  }
  const certDateTime = `${examDateStr}${timeStr ? `      ${timeStr}` : ""}`.trim();

  return {
    serialNumber: actualForm.serialNumber || "",
    workerName: actualForm.name || patient.name || "",
    fatherHusbandName: String(actualForm.fatherHusbandName || patient.fatherName || "").trim(),
    gender: actualForm.sex || patient.gender || "",
    residenceLine1: r1,
    residenceLine2: r2,
    pinCode: addressPartFromForm(actualForm.pinCode, patient.pincode),
    city: addressPartFromForm(actualForm.city, patient.city),
    state: addressPartFromForm(actualForm.state, patient.state),
    dob: formatDateDMY(actualForm.dateOfBirth || patient.dob || ""),
    factoryName: actualForm.factoryName || patient.company || "",
    // Blank Form 33 already strikes "Yes". Clear + rewrite Yes/No, strike only the
    // unused option. Area Name stays blank unless a real name is set (no "NA").
    hazardousChoice: "Yes / No",
    hazardousYes: isHazardous ? "" : "yes",
    hazardousNo: isHazardous ? "yes" : "",
    hazardousArea: cleanAreaName(actualForm.hazardousArea),
    dangerousChoice: "Yes / No",
    dangerousYes: isDangerous ? "" : "yes",
    dangerousNo: isDangerous ? "yes" : "",
    dangerousArea: cleanAreaName(actualForm.dangerousArea),
    identificationMarks: actualForm.identificationMarks || patient.identificationMarks || "",
    examinedAge: actualForm.examinedAge || (patient.age != null ? String(patient.age) : ""),
    unfitReason: isUnfit ? actualForm.unfitReason || "" : "",
    previousCertificate: isUnfit ? actualForm.previousCertificate || "" : "",
    strikeHis1: isFemale ? "yes" : "",
    strikeHer1: isFemale ? "" : "yes",
    strikeHe1: isFemale ? "yes" : "",
    strikeShe1: isFemale ? "" : "yes",
    strikeHe2: isUnfit ? (isFemale ? "yes" : "") : "",
    strikeShe2: isUnfit ? (isFemale ? "" : "yes") : "",
    strikeHe3: isUnfit ? (isFemale ? "yes" : "") : "",
    strikeShe3: isUnfit ? (isFemale ? "" : "yes") : "",
    certificateDateTime: certDateTime,
    patientSignature: "",
    bottomCompanyName: actualForm.factoryName || patient.company || "",
    bottomExamDate: formatDateDMY(actualForm.bottomExamDate || ""),
    bottomUnfitPeriod: isUnfit ? actualForm.extensionNote || "" : "",
    bottomSymptoms: actualForm.symptoms || (isUnfit ? "" : "Fit For Joining"),
    bottomSignatureDate: formatDateDMY(actualForm.bottomSignatureDate || "")
  };
}

/**
 * Build PDF fill values matching frontend template logic.
 */
function buildHealthRegisterValues(actualForm, patient) {
  // Nature of job: keep printed options and strike only the unselected ones.
  // If "Field" is selected, overwrite the box with "Field".
  const jobNatureRaw = actualForm.jobNature ?? "";
  const jobNatureLower = String(jobNatureRaw).trim().toLowerCase();
  const normalized = jobNatureLower || "full time";
  const isField = normalized.includes("field");
  const isFull = normalized.includes("full");
  const isPart = normalized.includes("part");
  const isContractual = normalized.includes("contract");

  const selectedType = isField
    ? "field"
    : isFull
      ? "full"
      : isPart
        ? "part"
        : isContractual
          ? "contract"
          : "full";

  const natureOfJobValue = selectedType === "field" ? "Field" : "";
  const natureOfJobStrikeFullTime = selectedType === "full" || selectedType === "field" ? "" : "yes";
  const natureOfJobStrikePartTime = selectedType === "part" || selectedType === "field" ? "" : "yes";
  const natureOfJobStrikeContractual = selectedType === "contract" || selectedType === "field" ? "" : "yes";

  return {
    serialNumber: actualForm.serialNumber || "",
    workerName: actualForm.name || patient.name || "",
    gender: actualForm.sex || patient.gender || "",
    dob: formatDateDMY(actualForm.dateOfBirth || patient.dob || ""),
    department: actualForm.departmentWorks || patient.department || "",
    hazardousProcess: String(actualForm.hazardousProcessName || "").trim().replace(/^n\/?a$/i, ""),
    dangerousProcess: String(actualForm.dangerousOperation || "").trim().replace(/^n\/?a$/i, ""),
    natureOfJob: natureOfJobValue,
    natureOfJobStrikeFullTime,
    natureOfJobStrikePartTime,
    natureOfJobStrikeContractual,
    materialsExposed: actualForm.rawMaterialsExposed || "NA",
    dateOfPosting: formatDateDMY(actualForm.dateOfPosting || patient.dateOfJoining || ""),
    dateOfLeaving: formatDateDMY(actualForm.dateOfLeaving || ""),
    reasonForLeaving: actualForm.reasonsForLeaving || "",
    examDate: formatDateDMY(actualForm.examinationDate || ""),
    signsSymptoms: actualForm.signsSymptoms || "",
    natureOfTests: String(actualForm.natureOfTests || "").trim(),
    // Result: keep printed "Fit / Unfit"; cross only the unused option
    resultStrikeFit: String(actualForm.result || "FIT").toUpperCase() === "UNFIT" ? "yes" : "",
    resultStrikeUnfit: String(actualForm.result || "FIT").toUpperCase() === "FIT" ? "yes" : "",
    temporaryWithdrawal:
      actualForm.result === "UNFIT" ? actualForm.withdrawalPeriod || "" : "",
    reasonForWithdrawal:
      actualForm.result === "UNFIT" ? actualForm.withdrawalReason || "" : "",
    dateDeclaredUnfit:
      actualForm.result === "UNFIT"
        ? formatDateDMY(actualForm.dateDeclaredUnfit || "")
        : "",
    dateOfFitnessCertificate: formatDateDMY(
      actualForm.dateFitnessCertificateIssued || ""
    ),
    doctorSignatureDate: formatDateDMY(
      actualForm.doctorSignatureDate
        ? String(actualForm.doctorSignatureDate).split("T")[0]
        : ""
    )
  };
}

function buildBulkFormValues(formKey, patient) {
  const safePatient = patient
    ? { ...patient, govIdNumber: decrypt(patient.govIdNumber) }
    : patient;
  const formEntry = safePatient?.forms?.[formKey] || {};
  const actualForm = formEntry.data || {};

  switch (formKey) {
    case "form33":
      return buildForm33Values(actualForm, safePatient);
    case "healthRegister":
      return buildHealthRegisterValues(actualForm, safePatient);
    case "5-form-height-pass":
    case "36-form-airport-bohw-ht-back":
      return buildHeightPassLikeValues(actualForm, safePatient);
    case "4-form-airport-bohw":
      return buildAirportBohwValues(actualForm, safePatient);
    case "35-form-airport-bohw-ht-front":
      return buildAirportBohwHtFrontValues(actualForm, safePatient);
    default: {
      const data = applyCommonDefaults({ ...actualForm }, safePatient);
      if (formKey === "preMedical") {
        // registry id differs from form key
        return data;
      }
      return data;
    }
  }
}

function resolveFillFormId(formKey) {
  if (Object.prototype.hasOwnProperty.call(FORM_KEY_TO_FILL_ID, formKey)) {
    return FORM_KEY_TO_FILL_ID[formKey];
  }
  return formKey;
}

/**
 * Bulk export always includes selected forms, even when unsaved/draft.
 * Unsaved forms still fill from patient defaults so staff can print blanks for manual work.
 */
function isFormReadyForExport(_formEntry) {
  return true;
}

module.exports = {
  FORM_KEY_TO_FILL_ID,
  buildBulkFormValues,
  resolveFillFormId,
  isFormReadyForExport
};
