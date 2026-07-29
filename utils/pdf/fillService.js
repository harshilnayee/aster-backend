const fs = require("fs");
const path = require("path");
const {
  PDFDocument,
  rgb,
  StandardFonts,
  PDFName,
  pushGraphicsState,
  popGraphicsState,
  rectangle,
  clip,
  endPath,
} = require("pdf-lib");

const getRegistryPath = () => path.join(__dirname, "../../config/formRegistry.json");

// Process-lifetime caches — bulk export fills the same templates hundreds of times
let registryCache = null;
let registryMtimeMs = 0;
const coordsCache = new Map(); // fileName -> { mtimeMs, data }
const pdfBytesCache = new Map(); // absolute path -> { mtimeMs, bytes }
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

function loadPdfTemplateBytes(pdfFile) {
  const pdfPath = path.join(__dirname, "../../all forms", pdfFile);
  if (!fs.existsSync(pdfPath)) {
    throw Object.assign(new Error(`PDF template file not found: ${pdfFile}`), { status: 404 });
  }
  const mtimeMs = fs.statSync(pdfPath).mtimeMs;
  const cached = pdfBytesCache.get(pdfPath);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.bytes;
  }
  const bytes = fs.readFileSync(pdfPath);
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

async function fillPdfToBytes(formId, inputValues) {
  if (!inputValues || typeof inputValues !== "object") {
    throw Object.assign(new Error("Field values are required"), { status: 400 });
  }
  // Shallow copy so concurrent bulk jobs don't mutate shared objects
  const values = { ...inputValues };
  try {
    const registry = loadRegistry();
    const formConfig = registry[formId];
    if (!formConfig) {
      throw Object.assign(new Error(`Form config not found for: ${formId}`), { status: 404 });
    }

    const coords = loadCoordinates(formConfig.coordinatesFile);
    const { doctorSignatureBase64, doctorStampBase64 } = loadDoctorAssets();

    // Auto-inject doctor signature base64 if defined in coordinates
    const docSignKeys = ["doctorSignature", "doctorSignatureRow", "signatureMedicalOfficer"];
    for (const key of docSignKeys) {
      if (coords[key] && doctorSignatureBase64 && (!values[key] || (typeof values[key] === "string" && !values[key].startsWith("data:image")))) {
        values[key] = doctorSignatureBase64;
      }
    }

    // Auto-inject doctor stamp base64 if defined in coordinates
    if (coords["doctorStamp"] && doctorStampBase64 && (!values["doctorStamp"] || (typeof values["doctorStamp"] === "string" && !values["doctorStamp"].startsWith("data:image")))) {
      values["doctorStamp"] = doctorStampBase64;
    }

    // For food handler certificate, also draw doctor's signature in the candidate's signature box
    if (formId === "17-form-food-handler-certificate" && doctorSignatureBase64) {
      values["patientSignature"] = doctorSignatureBase64;
    }

    const pdfBytes = loadPdfTemplateBytes(formConfig.pdfFile);

    // 4. Load PDFDocument and draw text
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const zapfFont = await pdfDoc.embedFont(StandardFonts.ZapfDingbats);
    const timesFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const timesBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    
    // Remove annotations (including the white filled square box covering signature) specifically for Form 5 and Form 36
    if (formId === "5-form-height-pass" || formId === "36-form-airport-bohw-ht-back") {
      const allPages = pdfDoc.getPages();
      if (allPages.length > 0) {
        const page = allPages[0];
        page.node.delete(PDFName.of('Annots'));
        page.drawRectangle({
          x: 99.43,
          y: 65.48,
          width: 141.95,
          height: 54.24,
          borderColor: rgb(0, 0, 0),
          borderWidth: 1.2
        });
      }
    }

    // Draw each provided field value or coordinate (so we can clear empty inputs with whiteBg)
    for (const [fieldName, coord] of Object.entries(coords)) {
      const val = values[fieldName];
      const pageIndex = (coord.page || 1) - 1;
      const totalPages = pdfDoc.getPageCount();
      
      if (pageIndex >= 0 && pageIndex < totalPages) {
        const page = pdfDoc.getPage(pageIndex);
        
        let drawVal = val !== undefined && val !== null ? String(val) : "";
        let finalCoord = coord;

        // Check if it's a binary choice field with yes/no sub-coordinates
        if (coord.yes && coord.no) {
          // If the "no" option has a whiteBg specified, clear it first (e.g. to cover pre-printed checkmarks)
          if (coord.no.whiteBg && coord.no.width && coord.no.height) {
            page.drawRectangle({
              x: Number(coord.no.x),
              y: Number(coord.no.y),
              width: Number(coord.no.width),
              height: Number(coord.no.height),
              color: rgb(1, 1, 1),
            });
          }
          const isYes = String(val).toUpperCase() === "YES" || val === true;
          finalCoord = isYes ? coord.yes : coord.no;
          drawVal = "√";
        }

        let textX = Number(finalCoord.x);
        let textY = Number(finalCoord.y);

        // erase: white-out a pre-printed mark (e.g. Form 33's default strike on "Yes") then stop
        if (
          finalCoord.erase &&
          finalCoord.width &&
          finalCoord.height &&
          val !== undefined &&
          val !== null &&
          val !== ""
        ) {
          page.drawRectangle({
            x: Number(finalCoord.x),
            y: Number(finalCoord.y),
            width: Number(finalCoord.width),
            height: Number(finalCoord.height),
            color: rgb(1, 1, 1),
          });
          continue;
        }

        // White background:
        // - clearAlways: always (Form 33 Area Name has pre-printed "NA")
        // - whiteBg: only when there is content (empty+whiteBg wiped printed "referred")
        if (finalCoord.width && finalCoord.height) {
          if (finalCoord.clearAlways || (finalCoord.whiteBg && drawVal !== "")) {
            page.drawRectangle({
              x: Number(finalCoord.x),
              y: Number(finalCoord.y),
              width: Number(finalCoord.width),
              height: Number(finalCoord.height),
              color: rgb(1, 1, 1),
            });
          }
        }

        // Draw standard content only if a valid value exists
        if (val !== undefined && val !== null && val !== "") {
          if (finalCoord.drawCircle && finalCoord.width && finalCoord.height) {
            try {
              const centerX = Number(finalCoord.x) + Number(finalCoord.width) / 2;
              const centerY = Number(finalCoord.y) + Number(finalCoord.height) / 2;
              const radius = (Math.min(Number(finalCoord.width), Number(finalCoord.height)) / 2) + 1.5;
              page.drawCircle({
                x: centerX,
                y: centerY,
                size: radius,
                borderColor: rgb(0, 0, 0),
                borderWidth: 1.2,
              });
            } catch (err) {
              console.error("Error drawing circle:", err);
            }
          } else if (finalCoord.drawSlash) {
            try {
              const startX = Number(finalCoord.x);
              const startY = Number(finalCoord.y);
              const endX = startX + Number(finalCoord.width || 0);
              const endY = startY + Number(finalCoord.height || 0);
              page.drawLine({
                start: { x: startX, y: startY },
                end: { x: endX, y: endY },
                thickness: 1.5,
                color: rgb(0, 0, 0)
              });
            } catch (err) {
              console.error("Error drawing diagonal slash:", err);
            }
          } else if (finalCoord.drawLine) {
            try {
              const startX = Number(finalCoord.x);
              // y is the strike mid-line (do not offset by height — that pushed lines under the text)
              const startY = Number(finalCoord.y);
              const endX = startX + Number(finalCoord.width || 0);
              const endY = startY;
              page.drawLine({
                start: { x: startX, y: startY },
                end: { x: endX, y: endY },
                thickness: Number(
                  finalCoord.lineThickness != null ? finalCoord.lineThickness : 1.5
                ),
                color: rgb(0, 0, 0)
              });
            } catch (err) {
              console.error("Error drawing line strike-out:", err);
            }
          } else if (typeof drawVal === "string" && drawVal.startsWith("data:image/")) {
            try {
              let imageBuffer;
              let isPng = true;
              if (drawVal.startsWith("data:image/png;base64,")) {
                imageBuffer = Buffer.from(drawVal.replace("data:image/png;base64,", ""), "base64");
                isPng = true;
              } else if (drawVal.startsWith("data:image/jpeg;base64,") || drawVal.startsWith("data:image/jpg;base64,")) {
                imageBuffer = Buffer.from(drawVal.replace(/^data:image\/jpe?g;base64,/, ""), "base64");
                isPng = false;
              }
              if (imageBuffer) {
                const embeddedImage = isPng ? await pdfDoc.embedPng(imageBuffer) : await pdfDoc.embedJpg(imageBuffer);
                page.drawImage(embeddedImage, {
                  x: Number(finalCoord.x),
                  y: Number(finalCoord.y),
                  width: Number(finalCoord.width || 100),
                  height: Number(finalCoord.height || 50),
                });
              }
            } catch (err) {
              console.error("Error embedding signature image:", err);
            }
          } else {
            // Draw standard text at calculated/centered coordinates
            let currentFontSize = Number(finalCoord.fontSize || formConfig.defaultFontSize || 11);
            let currentFont = finalCoord.bold ? helveticaBoldFont : helveticaFont;

            const preferredFont = finalCoord.font || formConfig.defaultFont;
            if (preferredFont === "TimesRoman") {
              currentFont = finalCoord.bold ? timesBoldFont : timesFont;
            }

            if (drawVal === "√" || drawVal === "\u2713" || drawVal === "\u2714") {
              currentFont = zapfFont;
              drawVal = "\u2714";
            }

            const wrapText = (text, maxChars) => {
              const words = text.split(" ");
              const lines = [];
              let currentLine = "";
              for (const word of words) {
                if ((currentLine + " " + word).trim().length <= maxChars) {
                  currentLine = (currentLine + " " + word).trim();
                } else {
                  if (currentLine) lines.push(currentLine);
                  currentLine = word;
                }
              }
              if (currentLine) lines.push(currentLine);
              return lines;
            };

            let lines = [String(drawVal)];
            if (finalCoord.multiline && finalCoord.maxChars) {
              lines = wrapText(String(drawVal), finalCoord.maxChars);
            } else if (String(drawVal).includes("\n")) {
              lines = String(drawVal).split("\n");
            }

            // Auto-scale font size if text exceeds bounding box width (for single-line fields with specified width)
            // Skip when form/field locks size so filled text matches the printed form (e.g. Form 33),
            // unless fitToWidth is set (fixed box that must not spill into the next column).
            if (
              finalCoord.width &&
              !finalCoord.multiline &&
              lines.length === 1 &&
              (finalCoord.fitToWidth ||
                (!formConfig.lockFontSize && !finalCoord.lockFontSize))
            ) {
              try {
                const textWidth = currentFont.widthOfTextAtSize(lines[0], currentFontSize);
                const targetWidth = Number(finalCoord.width);
                if (textWidth > targetWidth && targetWidth > 0) {
                  const scale = targetWidth / textWidth;
                  currentFontSize = Math.max(6, Math.floor(currentFontSize * scale * 10) / 10);
                }
              } catch (err) {
                console.error("Error auto-scaling font size:", err);
              }
            }

            const lineHeight = currentFontSize * 1.2;
            const totalTextHeight = lines.length * lineHeight;
            const boxH = finalCoord.height ? Number(finalCoord.height) : 0;
            const useClip =
              finalCoord.clip &&
              finalCoord.width &&
              finalCoord.height;

            // Clipped/fixed boxes: never park the baseline on the box bottom —
            // descenders (g, y, p) would be cut off by the clip rect.
            if (useClip && boxH > 0 && lines.length === 1) {
              let ascent = currentFontSize * 0.8;
              let descent = currentFontSize * 0.25;
              if (ascent + descent > boxH) {
                currentFontSize = Math.max(
                  6,
                  Math.floor(((boxH * 0.92) / (ascent + descent)) * currentFontSize * 10) / 10
                );
                ascent = currentFontSize * 0.8;
                descent = currentFontSize * 0.25;
              }
              textY =
                Number(finalCoord.y) +
                descent +
                Math.max(0, (boxH - ascent - descent) / 2);
            }

            let initialY = textY;
            if (finalCoord.centerText && finalCoord.height) {
              const capHeight = currentFontSize * 0.7;
              if (lines.length === 1) {
                initialY = Number(finalCoord.y) + Math.max(0, (Number(finalCoord.height) - capHeight) / 2);
              } else {
                initialY = Number(finalCoord.y) + (Number(finalCoord.height) - totalTextHeight) / 2 + (lines.length - 1) * lineHeight;
              }
            }

            if (useClip) {
              page.pushOperators(
                pushGraphicsState(),
                rectangle(
                  Number(finalCoord.x),
                  Number(finalCoord.y),
                  Number(finalCoord.width),
                  Number(finalCoord.height)
                ),
                clip(),
                endPath()
              );
            }

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              let lineX = textX;
              if (finalCoord.centerText && finalCoord.width) {
                try {
                  const lineWidth = currentFont.widthOfTextAtSize(line, currentFontSize);
                  lineX = Number(finalCoord.x) + (Number(finalCoord.width) - lineWidth) / 2;
                } catch (err) {
                  console.error("Error centering line:", err);
                }
              }
              page.drawText(line, {
                x: lineX,
                y: initialY - i * lineHeight,
                size: currentFontSize,
                font: currentFont,
                color: rgb(0, 0, 0),
              });
            }

            if (useClip) {
              page.pushOperators(popGraphicsState());
            }
          }
        }
      }
    }

    const modifiedPdfBytes = await pdfDoc.save();
    return {
      bytes: Buffer.from(modifiedPdfBytes),
      filename: `filled_${formConfig.pdfFile}`
    };
  } catch (error) {
    if (error.status) throw error;
    console.error("Error filling PDF form:", error);
    throw error;
  }
}



module.exports = {
  fillPdfToBytes,
  getRegistryPath
};
