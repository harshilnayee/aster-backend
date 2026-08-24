const mongoose = require("mongoose");
const { PDFDocument } = require("pdf-lib");
const Patient = require("../models/Patient");
const { fillPdfToBytes } = require("../utils/pdf/fillService");
const {
  buildBulkFormValues,
  resolveFillFormId
} = require("../utils/pdf/bulkFormValues");
const { loadExportPrefsForUser } = require("../utils/pdf/clinicExportPrefs");
const { loadAllFormFieldRules } = require("../utils/pdf/formFieldRules");
const { saveCompressedPdf } = require("../utils/pdf/compressPdf");
const { buildBulkPatientProjection } = require("./pdfController");
const {
  PUBLIC_FORM_LABELS,
  isAllowedPublicFormKey,
  isCompletedForm,
  isDownloadableFormKey
} = require("../utils/publicCardForms");

function patientQuery(id) {
  return mongoose.Types.ObjectId.isValid(id)
    ? { _id: id }
    : { patientId: String(id).trim() };
}

function sanitizeFilenameSegment(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function loadPublicPatient(id, formKeys) {
  if (!id || String(id).length > 40) {
    const err = new Error("Invalid patient ID");
    err.status = 400;
    throw err;
  }

  const keys = formKeys && formKeys.length
    ? formKeys
    : Object.keys(PUBLIC_FORM_LABELS);

  const patient = await Patient.findOne(patientQuery(id))
    .select(buildBulkPatientProjection(keys))
    .lean();

  if (!patient) {
    const err = new Error("Worker record not found");
    err.status = 404;
    throw err;
  }
  return patient;
}

async function loadFillContext(patient) {
  const clinicUser = patient.clinicId ? { clinicId: patient.clinicId } : {};
  const [clinicPrefs, allFieldRules] = await Promise.all([
    loadExportPrefsForUser(clinicUser),
    loadAllFormFieldRules(clinicUser)
  ]);
  return {
    clinicPrefs: { ...clinicPrefs, includeUnsavedForms: false },
    allFieldRules
  };
}

function completedDownloadableKeys(patient) {
  const forms = patient.forms && typeof patient.forms === "object" ? patient.forms : {};
  return Object.keys(PUBLIC_FORM_LABELS).filter(
    (key) => isCompletedForm(forms[key]) && isDownloadableFormKey(key)
  );
}

async function fillOneForm(patient, formKey, clinicPrefs, allFieldRules) {
  const fillId = resolveFillFormId(formKey);
  if (!fillId) {
    const err = new Error("This form does not have a PDF download.");
    err.status = 400;
    throw err;
  }
  const values = buildBulkFormValues(formKey, patient, clinicPrefs, allFieldRules[formKey]);
  return fillPdfToBytes(fillId, values);
}

function sendPdf(res, bytes, filename) {
  const safeName = sanitizeFilenameSegment(filename.replace(/\.pdf$/i, "")) || "form";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.setHeader("Cache-Control", "private, no-store");
  return res.send(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
}

/**
 * GET /api/public/patients/:id/forms/:formKey
 * Filled PDF for one completed exam. No clinic login.
 */
async function downloadPublicForm(req, res, next) {
  try {
    const formKey = String(req.params.formKey || "").trim();
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(formKey) || !isAllowedPublicFormKey(formKey)) {
      return res.status(400).json({ message: "Unknown form" });
    }
    if (!isDownloadableFormKey(formKey)) {
      return res.status(400).json({ message: "This form does not have a PDF download." });
    }

    const patient = await loadPublicPatient(req.params.id, [formKey]);
    const forms = patient.forms && typeof patient.forms === "object" ? patient.forms : {};
    if (!isCompletedForm(forms[formKey])) {
      return res.status(404).json({ message: "This examination has not been completed yet." });
    }

    const { clinicPrefs, allFieldRules } = await loadFillContext(patient);
    const result = await fillOneForm(patient, formKey, clinicPrefs, allFieldRules);
    const label = sanitizeFilenameSegment(PUBLIC_FORM_LABELS[formKey] || formKey);
    const idPart = sanitizeFilenameSegment(patient.patientId) || "worker";
    return sendPdf(res, result.bytes, `${idPart}_${label}`);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("downloadPublicForm error:", error);
    return res.status(500).json({ message: "This form could not be generated." });
  }
}

/**
 * GET /api/public/patients/:id/forms-pack
 * One PDF with every completed downloadable exam.
 */
async function downloadPublicFormPack(req, res, next) {
  try {
    const patient = await loadPublicPatient(req.params.id);
    const keys = completedDownloadableKeys(patient);
    if (keys.length === 0) {
      return res.status(404).json({ message: "No completed forms are available to download." });
    }

    const { clinicPrefs, allFieldRules } = await loadFillContext(patient);
    const mergedPdf = await PDFDocument.create();
    let pagesAdded = 0;

    for (const formKey of keys) {
      try {
        const { bytes } = await fillOneForm(patient, formKey, clinicPrefs, allFieldRules);
        const srcDoc = await PDFDocument.load(bytes);
        const pages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
        pages.forEach((page) => mergedPdf.addPage(page));
        pagesAdded += pages.length;
      } catch (err) {
        console.error(
          `Public pack fill failed for ${patient.patientId} / ${formKey}:`,
          err.message
        );
      }
    }

    if (pagesAdded === 0) {
      return res.status(500).json({ message: "Completed forms could not be generated." });
    }

    const pdfBytes = await saveCompressedPdf(mergedPdf);
    const idPart = sanitizeFilenameSegment(patient.patientId) || "worker";
    return sendPdf(res, pdfBytes, `${idPart}_completed_forms`);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("downloadPublicFormPack error:", error);
    return res.status(500).json({ message: "Completed forms could not be generated." });
  }
}

module.exports = {
  downloadPublicForm,
  downloadPublicFormPack
};
