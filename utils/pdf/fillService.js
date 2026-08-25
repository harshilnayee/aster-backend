const fs = require("fs");
const path = require("path");
const { compactPdfBytes, compressEmbedImage } = require("./compressPdf");

let fillCorePromise = null;
function loadFillCore() {
  if (!fillCorePromise) fillCorePromise = import("./fillCore.mjs");
  return fillCorePromise;
}

const getRegistryPath = () => path.join(__dirname, "../../config/formRegistry.json");

let registryCache = null;
let registryMtimeMs = 0;
const coordsCache = new Map();
const pdfBytesCache = new Map();
let doctorAssetsCache = null;

function loadRegistry() {
  const registryPath = getRegistryPath();
  if (!fs.existsSync(registryPath)) {
    throw Object.assign(new Error("Form registry not found"), { status: 500 });
  }
  const mtimeMs = fs.statSync(registryPath).mtimeMs;
  if (registryCache && registryMtimeMs === mtimeMs) {
    return registryCache;
  }
  try {
    registryCache = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    registryMtimeMs = mtimeMs;
    return registryCache;
  } catch (parseErr) {
    console.error("Registry parse failure:", parseErr);
    throw Object.assign(new Error("Error parsing form registry configuration"), { status: 500 });
  }
}

function loadCoordinates(coordinatesFile) {
  const coordsPath = path.join(__dirname, "../../config/form-coordinates", coordinatesFile);
  if (!fs.existsSync(coordsPath)) {
    throw Object.assign(new Error(`Coordinates file not found: ${coordinatesFile}`), { status: 500 });
  }
  const mtimeMs = fs.statSync(coordsPath).mtimeMs;
  const cached = coordsCache.get(coordinatesFile);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.data;
  }
  try {
    const data = JSON.parse(fs.readFileSync(coordsPath, "utf8"));
    coordsCache.set(coordinatesFile, { mtimeMs, data });
    return data;
  } catch (parseErr) {
    console.error("Coordinates parse failure:", parseErr);
    throw Object.assign(new Error("Error parsing form coordinates configuration"), { status: 500 });
  }
}

async function loadPdfTemplateBytes(pdfFile) {
  const pdfPath = path.join(__dirname, "../../all forms", pdfFile);
  if (!fs.existsSync(pdfPath)) {
    throw Object.assign(new Error(`PDF template file not found: ${pdfFile}`), { status: 404 });
  }
  const mtimeMs = fs.statSync(pdfPath).mtimeMs;
  const cached = pdfBytesCache.get(pdfPath);
  if (cached && cached.mtimeMs === mtimeMs && cached.bytes) {
    return cached.bytes;
  }
  if (cached && cached.mtimeMs === mtimeMs && cached.pending) {
    return cached.pending;
  }

  const pending = (async () => {
    const raw = fs.readFileSync(pdfPath);
    try {
      return await compactPdfBytes(raw);
    } catch (err) {
      console.warn("PDF template compact skipped:", err.message);
      return raw;
    }
  })();
  pdfBytesCache.set(pdfPath, { mtimeMs, pending });
  const bytes = await pending;
  pdfBytesCache.set(pdfPath, { mtimeMs, bytes });
  return bytes;
}

function loadDoctorAssets() {
  if (doctorAssetsCache) return doctorAssetsCache;

  let doctorSignatureBase64 = null;
  let doctorStampBase64 = null;
  try {
    const docSignPath = path.join(__dirname, "../../assets/doctor_sign_drsajan.png");
    if (fs.existsSync(docSignPath)) {
      doctorSignatureBase64 = `data:image/png;base64,${fs.readFileSync(docSignPath).toString("base64")}`;
    }
    const docStampPath = path.join(__dirname, "../../assets/doctor_stamp.png");
    if (fs.existsSync(docStampPath)) {
      doctorStampBase64 = `data:image/png;base64,${fs.readFileSync(docStampPath).toString("base64")}`;
    } else {
      const fallbackStamp = path.join(__dirname, "../../../stm.png");
      if (fs.existsSync(fallbackStamp)) {
        doctorStampBase64 = `data:image/png;base64,${fs.readFileSync(fallbackStamp).toString("base64")}`;
      }
    }
  } catch (err) {
    console.error("Failed to load doctor signature/stamp from disk:", err);
  }

  doctorAssetsCache = { doctorSignatureBase64, doctorStampBase64 };
  return doctorAssetsCache;
}

function injectDoctorAssets(values, coords) {
  const next = { ...values };
  const { doctorSignatureBase64, doctorStampBase64 } = loadDoctorAssets();
  const docSignKeys = ["doctorSignature", "doctorSignatureRow", "signatureMedicalOfficer"];
  for (const key of docSignKeys) {
    if (
      coords[key] &&
      doctorSignatureBase64 &&
      (!next[key] || (typeof next[key] === "string" && !next[key].startsWith("data:image")))
    ) {
      next[key] = doctorSignatureBase64;
    }
  }
  if (
    coords.doctorStamp &&
    doctorStampBase64 &&
    (!next.doctorStamp || (typeof next.doctorStamp === "string" && !next.doctorStamp.startsWith("data:image")))
  ) {
    next.doctorStamp = doctorStampBase64;
  }
  return next;
}

async function compressValueImages(values, coords) {
  const next = { ...values };
  for (const [fieldName, coord] of Object.entries(coords || {})) {
    const val = next[fieldName];
    if (typeof val !== "string" || !val.startsWith("data:image/")) continue;
    const isPng = val.startsWith("data:image/png;base64,");
    const b64 = val.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
    const imageBuffer = Buffer.from(b64, "base64");
    const keepAlpha = /sign|stamp/i.test(fieldName);
    const box = coord.yes && coord.no ? coord.yes || coord : coord;
    const prepared = compressEmbedImage(imageBuffer, {
      isPng,
      destWidthPt: box.width,
      destHeightPt: box.height,
      keepAlpha
    });
    const mime = prepared.kind === "png" ? "image/png" : "image/jpeg";
    next[fieldName] = `data:${mime};base64,${Buffer.from(prepared.bytes).toString("base64")}`;
  }
  return next;
}

const DOCTOR_VALUE_KEYS = new Set([
  "doctorSignature",
  "doctorSignatureRow",
  "signatureMedicalOfficer",
  "doctorStamp"
]);

async function slimValuesForClient(values, coords) {
  const compressed = await compressValueImages({ ...values }, coords);
  const out = {};
  for (const [key, val] of Object.entries(compressed)) {
    if (DOCTOR_VALUE_KEYS.has(key)) continue;
    if (val == null || val === "") continue;
    out[key] = val;
  }
  return out;
}

async function fillPdfToBytes(formId, inputValues) {
  if (!inputValues || typeof inputValues !== "object") {
    throw Object.assign(new Error("Field values are required"), { status: 400 });
  }
  try {
    const registry = loadRegistry();
    const formConfig = registry[formId];
    if (!formConfig) {
      throw Object.assign(new Error(`Form config not found for: ${formId}`), { status: 404 });
    }

    const coords = loadCoordinates(formConfig.coordinatesFile);
    const withDoctors = injectDoctorAssets({ ...inputValues }, coords);
    const values = await compressValueImages(withDoctors, coords);
    const pdfBytes = await loadPdfTemplateBytes(formConfig.pdfFile);
    const { fillPdfFromParts } = await loadFillCore();
    const result = await fillPdfFromParts(pdfBytes, coords, formConfig, formId, values);
    // Express 4 treats a raw Uint8Array as JSON. Previews must send a Buffer.
    return {
      filename: result.filename,
      bytes: Buffer.from(result.bytes)
    };
  } catch (error) {
    if (error.status) throw error;
    console.error("Error filling PDF form:", error);
    throw error;
  }
}

module.exports = {
  fillPdfToBytes,
  getRegistryPath,
  loadRegistry,
  loadCoordinates,
  loadPdfTemplateBytes,
  loadDoctorAssets,
  injectDoctorAssets,
  slimValuesForClient
};
