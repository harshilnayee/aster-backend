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

    // 1. Resolve form config
    const registryPath = getRegistryPath();
    if (!fs.existsSync(registryPath)) {
      return res.status(500).json({ message: "Form registry not found" });
    }
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    const formConfig = registry[formId];
    if (!formConfig) {
      return res.status(404).json({ message: `Form config not found for: ${formId}` });
    }

    // 2. Load coordinates
    const coordsPath = path.join(__dirname, "../config/form-coordinates", formConfig.coordinatesFile);
    if (!fs.existsSync(coordsPath)) {
      return res.status(500).json({ message: `Coordinates file not found: ${formConfig.coordinatesFile}` });
    }
    const coords = JSON.parse(fs.readFileSync(coordsPath, "utf8"));
    
    // Read doctor signature base64 if it exists on disk
    let doctorSignatureBase64 = null;
    const docSignPath = "C:\\Projects\\sajanbhai\\doctor_sign_drsajan.png";
    if (fs.existsSync(docSignPath)) {
      const docSignBytes = fs.readFileSync(docSignPath);
      doctorSignatureBase64 = `data:image/png;base64,${docSignBytes.toString("base64")}`;
    }

    // Auto-inject doctor signature base64 if defined in coordinates
    const doctorKeys = ["doctorSignature", "doctorSignatureRow", "doctorStamp", "signatureMedicalOfficer"];
    for (const key of doctorKeys) {
      if (coords[key] && doctorSignatureBase64) {
        values[key] = doctorSignatureBase64;
      }
    }

    // For food handler certificate, also draw doctor's signature in the candidate's signature box
    if (formId === "17-form-food-handler-certificate" && doctorSignatureBase64) {
      values["patientSignature"] = doctorSignatureBase64;
    }

    // 3. Load original PDF
    const pdfPath = path.join(__dirname, "../../all forms", formConfig.pdfFile);
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({ message: `PDF template file not found: ${formConfig.pdfFile}` });
    }
    const pdfBytes = fs.readFileSync(pdfPath);

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
    
    // Auto-load doctor stamp image if configured in coords but not provided in values
    if (coords.doctorStamp && !values.doctorStamp) {
      try {
        const stampPath = path.join(__dirname, "../../stm.png");
        if (fs.existsSync(stampPath)) {
          const stampBytes = fs.readFileSync(stampPath);
          values.doctorStamp = `data:image/png;base64,${stampBytes.toString("base64")}`;
        }
      } catch (err) {
        console.error("Failed to load doctorStamp from disk:", err);
      }
    }

    // Draw each provided field value or coordinate (so we can clear empty inputs with whiteBg)
    for (const [fieldName, coord] of Object.entries(coords)) {
      const val = values[fieldName];
      const pageIndex = (coord.page || 1) - 1;
      const totalPages = pdfDoc.getPageCount();
      
      if (pageIndex >= 0 && pageIndex < totalPages) {
        const page = pdfDoc.getPage(pageIndex);
        
        let textX = Number(coord.x);
        let textY = Number(coord.y);
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

        // Draw white background if requested and dimensions are present (regardless of whether val is empty)
        if (finalCoord.whiteBg && finalCoord.width && finalCoord.height) {
          page.drawRectangle({
            x: Number(finalCoord.x),
            y: Number(finalCoord.y),
            width: Number(finalCoord.width),
            height: Number(finalCoord.height),
            color: rgb(1, 1, 1),
          });
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

            if ((finalCoord.centerText || (coord.yes && coord.no)) && finalCoord.width && finalCoord.height) {
              try {
                const textWidth = currentFont.widthOfTextAtSize(String(drawVal), currentFontSize);
                const textHeight = 0.7 * currentFontSize;
                textX = Number(finalCoord.x) + (Number(finalCoord.width) - textWidth) / 2;
                textY = Number(finalCoord.y) + (Number(finalCoord.height) - textHeight) / 2;
              } catch (err) {
                console.error("Error centering text:", err);
              }
            }

            page.drawText(String(drawVal), {
              x: textX,
              y: textY,
              size: currentFontSize,
              font: currentFont,
              color: rgb(0, 0, 0),
            });
          }
        }
      }
    }

    const modifiedPdfBytes = await pdfDoc.save();

    // 5. Stream modified PDF back
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="filled_${formConfig.pdfFile}"`);
    return res.send(Buffer.from(modifiedPdfBytes));
  } catch (error) {
    console.error("Error filling PDF form:", error);
    next(error);
  }
}

async function getDoctorSignature(req, res, next) {
  try {
    const docSignPath = "C:\\Projects\\sajanbhai\\doctor_sign_drsajan.png";
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

module.exports = {
  getForms,
  getFormCoordinates,
  fillPdfForm,
  getDoctorSignature
};
