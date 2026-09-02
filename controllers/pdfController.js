const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, StandardFonts, PDFName } = require("pdf-lib");
const { clinicScopeFilter } = require("../utils/tenant");

// Helper to get registry path
const getRegistryPath = () => path.join(__dirname, "../config/formRegistry.json");

/**
 * Get all registered forms from registry
 * GET /api/forms
 */
async function getForms(req, res, next) {
  try {
    const registryPath = getRegistryPath();
    if (!fs.existsSync(registryPath)) {
      return res.status(200).json([]);
    }
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    
    // Format into a clean array for client consumption
    const formsList = Object.entries(registry).map(([safeId, config]) => ({
      safeId,
      displayName: config.displayName,
      pdfFile: config.pdfFile,
      coordinatesFile: config.coordinatesFile
    }));
    
    res.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=600");
    return res.status(200).json(formsList);
  } catch (error) {
    console.error("Error fetching forms list:", error);
    next(error);
  }
}

/**
 * Get coordinates configuration keys/inputs for a form
 * GET /api/forms/:formId/coordinates
 */
async function getFormCoordinates(req, res, next) {
  try {
    const { formId } = req.params;
    
    // Resolve form in registry
    const registryPath = getRegistryPath();
    if (!fs.existsSync(registryPath)) {
      return res.status(404).json({ message: "Form registry not found" });
    }
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    const formConfig = registry[formId];
    if (!formConfig) {
      return res.status(404).json({ message: `Form not found: ${formId}` });
    }
    
    // Read coordinates file
    const coordsPath = path.join(__dirname, "../config/form-coordinates", formConfig.coordinatesFile);
    if (!fs.existsSync(coordsPath)) {
      return res.status(200).json({ fields: [] });
    }
    const coords = JSON.parse(fs.readFileSync(coordsPath, "utf8"));
    
    // We only return the keys (input fields) that the client should fill
    const fields = Object.keys(coords);
    res.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=600");
    return res.status(200).json({ fields });
  } catch (error) {
    console.error("Error fetching coordinates:", error);
    next(error);
  }
}

/**
 * Overlay field values on the PDF template using coordinates
 * POST /api/forms/fill/:formId
 */
async function fillPdfForm(req, res, next) {
  try {
    const { formId } = req.params;
    const { values } = req.body;
    if (!values) {
      return res.status(400).json({ message: "Field values are required" });
    }

    const { userHasFormAccess } = require("../middleware/auth");
    if (!userHasFormAccess(req.user, formId)) {
      return res.status(403).json({
        message: `Access denied. You do not have permission to fill form: ${formId}`
      });
    }

    const { fillPdfToBytes } = require("../utils/pdf/fillService");
    const { applyFormFieldRules, loadAllFormFieldRules } = require("../utils/pdf/formFieldRules");
    const allFieldRules = await loadAllFormFieldRules(req.user);
    const fillIdToClient = {
      "1-form-personal-details": "preMedical",
      "22-form-post-medical": "postMedical"
    };
    const clientKey = fillIdToClient[formId] || formId;
    const fieldRules = { ...(allFieldRules[formId] || {}), ...(allFieldRules[clientKey] || {}) };
    const result = await fillPdfToBytes(formId, applyFormFieldRules(values, fieldRules));
    const pdfBytes = Buffer.isBuffer(result.bytes) ? result.bytes : Buffer.from(result.bytes);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    return res.send(pdfBytes);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Error filling PDF form:", error);
    next(error);
  }
}

async function getDoctorSignature(req, res, next) {
  try {
    const docSignPath = path.join(__dirname, "../assets/doctor_sign_drsajan.png");
    if (fs.existsSync(docSignPath)) {
      return res.sendFile(docSignPath);
    } else {
      return res.status(404).json({ message: "Doctor signature not found" });
    }
  } catch (error) {
    console.error("Error fetching doctor signature:", error);
    next(error);
  }
}

async function mapPool(items, concurrency, workerFn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await workerFn(items[current], current);
    }
  }

  const poolSize = Math.min(concurrency, Math.max(items.length, 1));
  await Promise.all(Array.from({ length: poolSize }, () => worker()));
  return results;
}

/** Fields needed to stamp selected forms (skip files / unused forms). */
const VITALS_FALLBACK_FORMS = [
  "5-form-height-pass",
  "36-form-airport-bohw-ht-back",
  "4-form-airport-bohw",
  "35-form-airport-bohw-ht-front"
];

/** Hard cap so one request cannot OOM the Render instance (205-worker ZIP spiked to 293 MB). */
const MAX_EXPORT_BATCH = 20;

function buildBulkPatientProjection(formKeys) {
  const keys = Array.isArray(formKeys) ? formKeys.map(String) : [];
  const projection = {
    patientId: 1,
    name: 1,
    surname: 1,
    age: 1,
    gender: 1,
    mobile: 1,
    employeeCode: 1,
    company: 1,
    companyAddress: 1,
    address: 1,
    city: 1,
    state: 1,
    pincode: 1,
    fatherName: 1,
    occupation: 1,
    department: 1,
    dob: 1,
    dateOfJoining: 1,
    govIdType: 1,
    govIdNumber: 1,
    aadharNo: 1,
    bloodGroup: 1,
    email: 1,
    employmentType: 1,
    contractingAgency: 1,
    diet: 1,
    knownHabit: 1,
    signature: 1,
    createdAt: 1,
    updatedAt: 1,
    examinationDate: 1,
    clinicId: 1
  };

  projection["forms.preMedical"] = 1;
  projection["forms.postMedical"] = 1;
  projection["forms.medicalExamReport"] = 1;

  for (const key of keys) {
    projection[`forms.${key}`] = 1;
  }
  return projection;
}

/**
 * Fast bulk export — fills PDFs on the server.
 * POST /api/forms/bulk-export
 * Body: { patientIds: string[], formKeys: string[], batchOffset?: number, batchLimit?: number, mode?: "zip" | "merged-pdf" }
 *   mode "zip"        → one PDF per patient merged, all patients in a ZIP (default)
 *   mode "merged-pdf" → every patient's pages stitched into a single PDF download
 */
async function bulkExportReports(req, res, next) {
  try {
    const { patientIds, formKeys, batchOffset = 0, batchLimit } = req.body || {};
    const { loadExportPrefsForUser } = require("../utils/pdf/clinicExportPrefs");
    const { loadAllFormFieldRules } = require("../utils/pdf/formFieldRules");
    const clinicPrefs = await loadExportPrefsForUser(req.user);
    const allFieldRules = await loadAllFormFieldRules(req.user);
    const mode =
      req.body?.mode === "zip" || req.body?.mode === "merged-pdf"
        ? req.body.mode
        : clinicPrefs.defaultExportMode;
    if (!Array.isArray(patientIds) || patientIds.length === 0) {
      return res.status(400).json({ message: "patientIds array is required" });
    }
    if (!Array.isArray(formKeys) || formKeys.length === 0) {
      return res.status(400).json({ message: "formKeys array is required" });
    }

    const Patient = require("../models/Patient");
    const archiver = require("archiver");
    const { PDFDocument } = require("pdf-lib");
    const { fillPdfToBytes } = require("../utils/pdf/fillService");
    const { saveCompressedPdf } = require("../utils/pdf/compressPdf");
    const {
      buildBulkFormValues,
      resolveFillFormId,
      isFormReadyForExport
    } = require("../utils/pdf/bulkFormValues");

    const uniqueIds = [...new Set(patientIds.map(String))];
    const { userHasFormAccess } = require("../middleware/auth");
    const exportableFormKeys = formKeys
      .map(String)
      .filter((key) => resolveFillFormId(key))
      .filter((key) => userHasFormAccess(req.user, key));

    if (exportableFormKeys.length === 0) {
      return res.status(403).json({
        message: "None of the selected forms are allowed for your account (or none support PDF export)."
      });
    }

    // Cap every request. Old clients sent 200+ IDs in one ZIP and OOM-killed Render.
    const offset = Math.max(0, Number(batchOffset) || 0);
    const requestedLimit = batchLimit != null ? Math.max(1, Number(batchLimit)) : uniqueIds.length;
    const limit = Math.min(MAX_EXPORT_BATCH, requestedLimit);
    const batchIds = uniqueIds.slice(offset, offset + limit);
    const hasMore = offset + limit < uniqueIds.length;

    if (batchIds.length === 0) {
      return res.status(400).json({ message: "No patients in this export batch." });
    }

    const scope = clinicScopeFilter(req);

    const patients = await Patient.find({ patientId: { $in: batchIds }, ...scope })
      .select(buildBulkPatientProjection(exportableFormKeys))
      .lean();
    const patientById = new Map(patients.map((p) => [p.patientId, p]));

    const jobs = [];
    for (const patientId of batchIds) {
      const patient = patientById.get(patientId);
      if (!patient) continue;
      const readyKeys = exportableFormKeys.filter((key) =>
        isFormReadyForExport(patient.forms?.[key], clinicPrefs)
      );
      if (readyKeys.length === 0) continue;
      jobs.push({ patient, formKeys: readyKeys });
    }

    function sanitizeFilenameSegment(str) {
      if (!str || typeof str !== "string") return "";
      return str
        .trim()
        .replace(/[^a-zA-Z0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
    }

    const exposeExportHeaders = () => {
      res.setHeader(
        "Access-Control-Expose-Headers",
        "X-Export-Count, X-Export-Has-More, X-Export-Batch-Offset, X-Export-Batch-Size, X-Export-Total-Requested, Content-Disposition"
      );
      res.setHeader("X-Export-Has-More", hasMore ? "1" : "0");
      res.setHeader("X-Export-Batch-Offset", String(offset));
      res.setHeader("X-Export-Batch-Size", String(batchIds.length));
      res.setHeader("X-Export-Total-Requested", String(uniqueIds.length));
    };

    // Soft-skip empty batches so later patient slices still export
    if (jobs.length === 0) {
      exposeExportHeaders();
      res.setHeader("X-Export-Count", "0");
      return res.status(200).json({
        skipped: true,
        exported: 0,
        hasMore,
        message: "No patients found for this batch."
      });
    }

    // Fill with low concurrency and stream the ZIP so PDFs are not all held in RAM.
    const concurrency = mode === "merged-pdf" ? 1 : 2;

    async function fillPatientReport(patient, keys) {
      const mergedPdf = await PDFDocument.create();
      let pagesAdded = 0;

      for (const formKey of keys) {
        try {
          const fillId = resolveFillFormId(formKey);
          const values = buildBulkFormValues(formKey, patient, clinicPrefs, allFieldRules[formKey]);
          const { bytes } = await fillPdfToBytes(fillId, values);
          const srcDoc = await PDFDocument.load(bytes);
          const pages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
          pages.forEach((page) => mergedPdf.addPage(page));
          pagesAdded += pages.length;
        } catch (err) {
          console.error(
            `Bulk export fill failed for ${patient.patientId} / ${formKey}:`,
            err.message
          );
        }
      }

      if (pagesAdded === 0) return null;

      const pdfBytes = await saveCompressedPdf(mergedPdf);
      const safeCompany = sanitizeFilenameSegment(patient.company);
      const companyPrefix = safeCompany ? `${safeCompany}_` : "";
      const safeName = sanitizeFilenameSegment(patient.name) || "Unknown";
      const safeEmp = sanitizeFilenameSegment(patient.employeeCode || patient.patientId) || "Unknown";
      return {
        filename: `${companyPrefix}${safeName}_${safeEmp}_Combined_Medical_Report.pdf`,
        bytes: Buffer.from(pdfBytes),
        company: patient.company
      };
    }

    const companyTag = (() => {
      const uniqueCompanies = [
        ...new Set(jobs.map((j) => sanitizeFilenameSegment(j.patient.company)).filter(Boolean))
      ];
      return uniqueCompanies.length === 1 ? `${uniqueCompanies[0]}_` : "";
    })();

    if (mode === "merged-pdf") {
      const masterDoc = await PDFDocument.create();
      let exported = 0;
      for (const job of jobs) {
        const item = await fillPatientReport(job.patient, job.formKeys);
        if (!item) continue;
        const srcDoc = await PDFDocument.load(item.bytes);
        const pages = await masterDoc.copyPages(srcDoc, srcDoc.getPageIndices());
        pages.forEach((page) => masterDoc.addPage(page));
        exported += 1;
      }
      if (exported === 0) {
        exposeExportHeaders();
        res.setHeader("X-Export-Count", "0");
        return res.status(200).json({
          skipped: true,
          exported: 0,
          hasMore,
          message: "PDF fill produced no pages for this batch."
        });
      }
      exposeExportHeaders();
      res.setHeader("X-Export-Count", String(exported));
      const mergedBytes = await saveCompressedPdf(masterDoc);
      const stamp = Date.now();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${companyTag}Aster_Medcare_Reports_${stamp}.pdf"`
      );
      return res.send(Buffer.from(mergedBytes));
    }

    exposeExportHeaders();
    res.setHeader("X-Export-Count", String(jobs.length));
    const stamp = Date.now();
    const zipLabel = hasMore || offset > 0 ? `_Part${Math.floor(offset / Math.max(limit, 1)) + 1}` : "";
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${companyTag}Aster_Medcare_Reports${zipLabel}_${stamp}.zip"`
    );

    const archive = archiver("zip", { zlib: { level: 1 } });
    archive.on("error", (err) => {
      console.error("Bulk export archive error:", err);
      try {
        res.end();
      } catch {
        // ignore
      }
    });
    archive.pipe(res);

    let appendChain = Promise.resolve();
    function appendToZip(bytes, name) {
      appendChain = appendChain.then(() => {
        archive.append(bytes, { name });
      });
      return appendChain;
    }

    await mapPool(jobs, concurrency, async ({ patient, formKeys: keys }) => {
      const item = await fillPatientReport(patient, keys);
      if (!item) return;
      await appendToZip(item.bytes, item.filename);
    });

    await appendChain;
    await archive.finalize();
  } catch (error) {
    console.error("Bulk export failed:", error);
    if (!res.headersSent) {
      next(error);
    } else {
      try {
        res.end();
      } catch {
        // ignore
      }
    }
  }
}

const CLIENT_KEY_FOR_FILL_ID = {
  "1-form-personal-details": "preMedical",
  "22-form-post-medical": "postMedical"
};
const MAX_VALUES_BATCH = 50;

function canAccessFillId(user, formId) {
  const { userHasFormAccess } = require("../middleware/auth");
  if (userHasFormAccess(user, formId)) return true;
  const clientKey = CLIENT_KEY_FOR_FILL_ID[formId];
  return Boolean(clientKey && userHasFormAccess(user, clientKey));
}
const DOCTOR_STAMP_PATH = path.join(__dirname, "../assets/doctor_stamp.png");

async function getDoctorStamp(req, res, next) {
  try {
    if (fs.existsSync(DOCTOR_STAMP_PATH)) {
      res.setHeader("Cache-Control", "private, max-age=86400");
      return res.sendFile(DOCTOR_STAMP_PATH);
    }
    return res.status(404).json({ message: "Doctor stamp not found" });
  } catch (error) {
    console.error("Error fetching doctor stamp:", error);
    next(error);
  }
}

async function getFormTemplate(req, res, next) {
  try {
    const { formId } = req.params;
    if (!canAccessFillId(req.user, formId)) {
      return res.status(403).json({ message: `Access denied for form: ${formId}` });
    }
    const { loadRegistry, loadPdfTemplateBytes } = require("../utils/pdf/fillService");
    const registry = loadRegistry();
    const formConfig = registry[formId];
    if (!formConfig) {
      return res.status(404).json({ message: `Form not found: ${formId}` });
    }
    const bytes = await loadPdfTemplateBytes(formConfig.pdfFile);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("Content-Disposition", `inline; filename="${formConfig.pdfFile}"`);
    return res.send(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  }
}

async function getFormLayout(req, res, next) {
  try {
    const { formId } = req.params;
    if (!canAccessFillId(req.user, formId)) {
      return res.status(403).json({ message: `Access denied for form: ${formId}` });
    }
    const { loadRegistry, loadCoordinates } = require("../utils/pdf/fillService");
    const registry = loadRegistry();
    const formConfig = registry[formId];
    if (!formConfig) {
      return res.status(404).json({ message: `Form not found: ${formId}` });
    }
    const coords = loadCoordinates(formConfig.coordinatesFile);
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.status(200).json({
      formId,
      displayName: formConfig.displayName || formId,
      defaultFontSize: formConfig.defaultFontSize || 11,
      defaultFont: formConfig.defaultFont || "",
      lockFontSize: Boolean(formConfig.lockFontSize),
      pdfFile: formConfig.pdfFile,
      coords
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  }
}

/**
 * Compact field values only — no PDF bytes.
 * POST /api/forms/bulk-values
 */
async function bulkExportValues(req, res, next) {
  try {
    const { patientIds, formKeys, batchOffset = 0, batchLimit } = req.body || {};
    if (!Array.isArray(patientIds) || patientIds.length === 0) {
      return res.status(400).json({ message: "patientIds array is required" });
    }
    if (!Array.isArray(formKeys) || formKeys.length === 0) {
      return res.status(400).json({ message: "formKeys array is required" });
    }

    const Patient = require("../models/Patient");
    const { loadExportPrefsForUser } = require("../utils/pdf/clinicExportPrefs");
    const { loadAllFormFieldRules } = require("../utils/pdf/formFieldRules");
    const {
      buildBulkFormValues,
      resolveFillFormId,
      isFormReadyForExport
    } = require("../utils/pdf/bulkFormValues");
    const { slimValuesForClient } = require("../utils/pdf/fillService");
    const { userHasFormAccess } = require("../middleware/auth");

    const clinicPrefs = await loadExportPrefsForUser(req.user);
    const allFieldRules = await loadAllFormFieldRules(req.user);
    const uniqueIds = [...new Set(patientIds.map(String))];
    const exportableFormKeys = formKeys
      .map(String)
      .filter((key) => resolveFillFormId(key))
      .filter((key) => userHasFormAccess(req.user, key));

    if (exportableFormKeys.length === 0) {
      return res.status(403).json({
        message: "None of the selected forms are allowed for your account (or none support PDF export)."
      });
    }

    const offset = Math.max(0, Number(batchOffset) || 0);
    const requestedLimit = batchLimit != null ? Math.max(1, Number(batchLimit)) : uniqueIds.length;
    const limit = Math.min(MAX_VALUES_BATCH, requestedLimit);
    const batchIds = uniqueIds.slice(offset, offset + limit);
    const hasMore = offset + limit < uniqueIds.length;

    const clinicScope =
      req.user?.role === "superadmin" || !req.user?.clinicId
        ? {}
        : { clinicId: req.user.clinicId };

    const patients = await Patient.find({ patientId: { $in: batchIds }, ...clinicScope })
      .select(buildBulkPatientProjection(exportableFormKeys))
      .lean();
    const patientById = new Map(patients.map((p) => [p.patientId, p]));

    const fillIds = {};
    for (const key of exportableFormKeys) {
      fillIds[key] = resolveFillFormId(key);
    }

    const { loadRegistry, loadCoordinates } = require("../utils/pdf/fillService");
    const registry = loadRegistry();
    const coordsByFillId = {};
    for (const fillId of Object.values(fillIds)) {
      if (!fillId || coordsByFillId[fillId]) continue;
      const cfg = registry[fillId];
      if (cfg?.coordinatesFile) coordsByFillId[fillId] = loadCoordinates(cfg.coordinatesFile);
    }

    const workers = [];
    for (const patientId of batchIds) {
      const patient = patientById.get(patientId);
      if (!patient) continue;
      const forms = {};
      for (const formKey of exportableFormKeys) {
        if (!isFormReadyForExport(patient.forms?.[formKey], clinicPrefs)) continue;
        const fillId = fillIds[formKey];
        const raw = buildBulkFormValues(formKey, patient, clinicPrefs, allFieldRules[formKey]);
        try {
          forms[formKey] = await slimValuesForClient(raw, coordsByFillId[fillId] || {});
        } catch (slimErr) {
          console.warn("bulk-values skipped a form (image/value compress):", patientId, formKey, slimErr.message);
        }
      }
      if (Object.keys(forms).length === 0) continue;
      workers.push({
        patientId: patient.patientId,
        name: patient.name || "",
        employeeCode: patient.employeeCode || "",
        company: patient.company || "",
        forms
      });
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Access-Control-Expose-Headers",
      "X-Export-Has-More, X-Export-Batch-Offset, X-Export-Batch-Size, X-Export-Total-Requested"
    );
    res.setHeader("X-Export-Has-More", hasMore ? "1" : "0");
    res.setHeader("X-Export-Batch-Offset", String(offset));
    res.setHeader("X-Export-Batch-Size", String(batchIds.length));
    res.setHeader("X-Export-Total-Requested", String(uniqueIds.length));
    return res.status(200).json({
      workers,
      fillIds,
      formKeys: exportableFormKeys,
      hasMore,
      offset,
      limit,
      total: uniqueIds.length
    });
  } catch (error) {
    console.error("bulkExportValues failed:", error);
    next(error);
  }
}

module.exports = {
  getForms,
  getFormCoordinates,
  getFormTemplate,
  getFormLayout,
  fillPdfForm,
  getDoctorSignature,
  getDoctorStamp,
  bulkExportReports,
  bulkExportValues,
  buildBulkPatientProjection
};
