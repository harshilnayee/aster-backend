const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, StandardFonts, PDFName } = require("pdf-lib");

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
    const result = await fillPdfToBytes(formId, values);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    return res.send(result.bytes);
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
function buildBulkPatientProjection(formKeys) {
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
    photo: 1,
    signature: 1,
    createdAt: 1,
    updatedAt: 1,
    examinationDate: 1,
    // Vitals fallbacks used by Height Pass / HT Back builders
    "forms.preMedical": 1,
    "forms.postMedical": 1,
    "forms.1-form-personal-details": 1,
    "forms.4-form-airport-bohw": 1,
    "forms.5-form-height-pass": 1,
    "forms.35-form-airport-bohw-ht-front": 1,
    "forms.36-form-airport-bohw-ht-back": 1
  };

  for (const key of formKeys) {
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
    const { patientIds, formKeys, batchOffset = 0, batchLimit, mode = "zip" } = req.body || {};
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

    // Optional batching keeps each download smaller on slow networks
    const offset = Math.max(0, Number(batchOffset) || 0);
    const limit = batchLimit != null ? Math.max(1, Number(batchLimit)) : uniqueIds.length;
    const batchIds = uniqueIds.slice(offset, offset + limit);
    const hasMore = offset + limit < uniqueIds.length;

    if (batchIds.length === 0) {
      return res.status(400).json({ message: "No patients in this export batch." });
    }

    // Scope to caller's clinic when set (superadmin / missing clinicId = all)
    const clinicScope =
      req.user?.role === "superadmin" || !req.user?.clinicId
        ? {}
        : { clinicId: req.user.clinicId };

    const patients = await Patient.find({ patientId: { $in: batchIds }, ...clinicScope })
      .select(buildBulkPatientProjection(exportableFormKeys))
      .lean();
    const patientById = new Map(patients.map((p) => [p.patientId, p]));

    const jobs = [];
    for (const patientId of batchIds) {
      const patient = patientById.get(patientId);
      if (!patient) continue;
      const readyKeys = exportableFormKeys.filter((key) =>
        isFormReadyForExport(patient.forms?.[key])
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

    // Fill first, then stream ZIP — avoids empty 200 ZIPs and wrong X-Export-Count
    const concurrency = Math.min(16, Math.max(6, Math.ceil(jobs.length / 15)));
    const compiled = [];

    await mapPool(jobs, concurrency, async ({ patient, formKeys: keys }) => {
      const mergedPdf = await PDFDocument.create();
      let pagesAdded = 0;

      for (const formKey of keys) {
        try {
          const fillId = resolveFillFormId(formKey);
          const values = buildBulkFormValues(formKey, patient);
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

      if (pagesAdded === 0) return;

      const pdfBytes = await mergedPdf.save({ useObjectStreams: true });
      const safeCompany = sanitizeFilenameSegment(patient.company);
      const companyPrefix = safeCompany ? `${safeCompany}_` : "";
      const safeName = sanitizeFilenameSegment(patient.name) || "Unknown";
      const safeEmp = sanitizeFilenameSegment(patient.employeeCode || patient.patientId) || "Unknown";
      const filename = `${companyPrefix}${safeName}_${safeEmp}_Combined_Medical_Report.pdf`;
      compiled.push({ filename, bytes: Buffer.from(pdfBytes), company: patient.company });
    });

    if (compiled.length === 0) {
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
    res.setHeader("X-Export-Count", String(compiled.length));

    const uniqueCompanies = [
      ...new Set(
        compiled
          .map((item) => sanitizeFilenameSegment(item.company))
          .filter(Boolean)
      )
    ];
    const companyTag = uniqueCompanies.length === 1 ? `${uniqueCompanies[0]}_` : "";

    if (mode === "merged-pdf") {
      // Stitch all patient PDFs into one single PDF
      const masterDoc = await PDFDocument.create();
      for (const item of compiled) {
        const srcDoc = await PDFDocument.load(item.bytes);
        const pages = await masterDoc.copyPages(srcDoc, srcDoc.getPageIndices());
        pages.forEach((page) => masterDoc.addPage(page));
      }
      const mergedBytes = await masterDoc.save({ useObjectStreams: true });
      const stamp = Date.now();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${companyTag}Aster_Medcare_Reports_${stamp}.pdf"`
      );
      return res.send(Buffer.from(mergedBytes));
    }

    const stamp = Date.now();
    const zipLabel = hasMore || offset > 0 ? `_Part${Math.floor(offset / Math.max(limit, 1)) + 1}` : "";
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${companyTag}Aster_Medcare_Reports${zipLabel}_${stamp}.zip"`
    );

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", (err) => {
      console.error("Bulk export archive error:", err);
      try {
        if (!res.headersSent) {
          res.status(500).json({ message: "Failed to build ZIP archive." });
        } else {
          res.end();
        }
      } catch {
        // ignore
      }
    });
    archive.pipe(res);

    for (const item of compiled) {
      archive.append(item.bytes, { name: item.filename });
    }

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

module.exports = {
  getForms,
  getFormCoordinates,
  fillPdfForm,
  getDoctorSignature,
  bulkExportReports
};
