const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

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

    // 3. Load original PDF
    const pdfPath = path.join(__dirname, "../../all forms", formConfig.pdfFile);
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({ message: `PDF template file not found: ${formConfig.pdfFile}` });
    }
    const pdfBytes = fs.readFileSync(pdfPath);

    // 4. Load PDFDocument and draw text
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // Draw each provided field value
    for (const [fieldName, val] of Object.entries(values)) {
      const coord = coords[fieldName];
      if (coord && val) {
        const pageIndex = (coord.page || 1) - 1;
        const totalPages = pdfDoc.getPageCount();
        
        if (pageIndex >= 0 && pageIndex < totalPages) {
          const page = pdfDoc.getPage(pageIndex);
          
          let textX = Number(coord.x);
          let textY = Number(coord.y);
          let drawVal = String(val);
          let finalCoord = coord;

          // Check if it's a binary choice field with yes/no sub-coordinates
          if (coord.yes && coord.no) {
            const isYes = String(val).toUpperCase() === "YES" || val === true;
            finalCoord = isYes ? coord.yes : coord.no;
            drawVal = "X";
            textX = Number(finalCoord.x);
            textY = Number(finalCoord.y);
          }

          // Draw white background if requested and dimensions are present
          if (finalCoord.whiteBg && finalCoord.width && finalCoord.height) {
            page.drawRectangle({
              x: Number(finalCoord.x),
              y: Number(finalCoord.y),
              width: Number(finalCoord.width),
              height: Number(finalCoord.height),
              color: rgb(1, 1, 1),
            });
          }

          if (finalCoord.drawCircle && finalCoord.width && finalCoord.height) {
            try {
              const centerX = Number(finalCoord.x) + Number(finalCoord.width) / 2;
              const centerY = Number(finalCoord.y) + Number(finalCoord.height) / 2;
              // Circle radius is half the min dimension, slightly enlarged by 1.5 units to circle "over" the box cleanly
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
            if ((finalCoord.centerText || (coord.yes && coord.no)) && finalCoord.width && finalCoord.height) {
              try {
                const textWidth = helveticaFont.widthOfTextAtSize(String(drawVal), 11);
                const textHeight = 7.7; // ~0.7 * 11 cap height
                textX = Number(finalCoord.x) + (Number(finalCoord.width) - textWidth) / 2;
                textY = Number(finalCoord.y) + (Number(finalCoord.height) - textHeight) / 2;
              } catch (err) {
                console.error("Error centering text:", err);
              }
            }

            page.drawText(String(drawVal), {
              x: textX,
              y: textY,
              size: 11,
              font: helveticaFont,
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

module.exports = {
  getForms,
  getFormCoordinates,
  fillPdfForm
};
