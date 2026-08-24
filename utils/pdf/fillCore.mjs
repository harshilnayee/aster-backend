import {
  PDFDocument,
  rgb,
  StandardFonts,
  PDFName,
  pushGraphicsState,
  popGraphicsState,
  rectangle,
  clip,
  endPath
} from "pdf-lib";

function formatDateToMonthYear(val) {
  if (!val) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    return `/${mm}/${yyyy}`;
  }
  const s = String(val).trim();
  if (s.includes("T")) {
    const parts = s.split("T")[0].split("-");
    if (parts.length >= 2) return `/${parts[1]}/${parts[0]}`;
  }
  const isoMatch = s.match(/^(\d{4})-(\d{2})/);
  if (isoMatch) return `/${isoMatch[2]}/${isoMatch[1]}`;
  const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) return `/${dmyMatch[2].padStart(2, "0")}/${dmyMatch[3]}`;
  try {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `/${mm}/${yyyy}`;
    }
  } catch {
    // fallback
  }
  return s;
}

function decodeBase64(b64) {
  if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesFromDataUrl(drawVal) {
  if (typeof drawVal !== "string" || !drawVal.startsWith("data:image/")) return null;
  const png = drawVal.startsWith("data:image/png;base64,");
  const jpg =
    drawVal.startsWith("data:image/jpeg;base64,") || drawVal.startsWith("data:image/jpg;base64,");
  if (!png && !jpg) return null;
  const b64 = drawVal.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
  return { bytes: decodeBase64(b64), isPng: png };
}

function wrapText(text, maxChars) {
  const words = String(text).split(" ");
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
}

/**
 * Stamp field values onto an already-loaded official template.
 * Used by the API and by the browser so bulk export does not send the template 205 times.
 */
export async function fillPdfFromParts(templateBytes, coords, formConfig, formId, inputValues) {
  const values = { ...(inputValues || {}) };
  if (formId === "17-form-food-handler-certificate") {
    values.patientSignature = "";
    values.doctorSignature = "";
    if (values.date) values.date = formatDateToMonthYear(values.date);
  }

  const pdfDoc = await PDFDocument.load(templateBytes, { updateMetadata: false });
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const zapfFont = await pdfDoc.embedFont(StandardFonts.ZapfDingbats);
  const timesFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  if (formId === "5-form-height-pass" || formId === "36-form-airport-bohw-ht-back") {
    const allPages = pdfDoc.getPages();
    if (allPages.length > 0) {
      const page = allPages[0];
      page.node.delete(PDFName.of("Annots"));
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

  const totalPages = pdfDoc.getPageCount();
  for (const [fieldName, coord] of Object.entries(coords || {})) {
    const val = values[fieldName];
    const pageIndex = (coord.page || 1) - 1;
    if (pageIndex < 0 || pageIndex >= totalPages) continue;

    const page = pdfDoc.getPage(pageIndex);
    let drawVal = val !== undefined && val !== null ? String(val) : "";
    let finalCoord = coord;

    if (coord.yes && coord.no) {
      if (coord.no.whiteBg && coord.no.width && coord.no.height) {
        page.drawRectangle({
          x: Number(coord.no.x),
          y: Number(coord.no.y),
          width: Number(coord.no.width),
          height: Number(coord.no.height),
          color: rgb(1, 1, 1)
        });
      }
      const isYes = String(val).toUpperCase() === "YES" || val === true;
      finalCoord = isYes ? coord.yes : coord.no;
      drawVal = "√";
    }

    let textX = Number(finalCoord.x);
    let textY = Number(finalCoord.y);

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
        color: rgb(1, 1, 1)
      });
      continue;
    }

    if (finalCoord.width && finalCoord.height) {
      if (finalCoord.clearAlways || (finalCoord.whiteBg && drawVal !== "")) {
        page.drawRectangle({
          x: Number(finalCoord.x),
          y: Number(finalCoord.y),
          width: Number(finalCoord.width),
          height: Number(finalCoord.height),
          color: rgb(1, 1, 1)
        });
      }
    }

    if (val === undefined || val === null || val === "") continue;

    if (finalCoord.drawCircle && finalCoord.width && finalCoord.height) {
      const centerX = Number(finalCoord.x) + Number(finalCoord.width) / 2;
      const centerY = Number(finalCoord.y) + Number(finalCoord.height) / 2;
      const radius = Math.min(Number(finalCoord.width), Number(finalCoord.height)) / 2 + 1.5;
      page.drawCircle({
        x: centerX,
        y: centerY,
        size: radius,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1.2
      });
      continue;
    }

    if (finalCoord.drawSlash) {
      page.drawLine({
        start: { x: Number(finalCoord.x), y: Number(finalCoord.y) },
        end: {
          x: Number(finalCoord.x) + Number(finalCoord.width || 0),
          y: Number(finalCoord.y) + Number(finalCoord.height || 0)
        },
        thickness: 1.5,
        color: rgb(0, 0, 0)
      });
      continue;
    }

    if (finalCoord.drawLine) {
      page.drawLine({
        start: { x: Number(finalCoord.x), y: Number(finalCoord.y) },
        end: {
          x: Number(finalCoord.x) + Number(finalCoord.width || 0),
          y: Number(finalCoord.y)
        },
        thickness: Number(finalCoord.lineThickness != null ? finalCoord.lineThickness : 1.5),
        color: rgb(0, 0, 0)
      });
      continue;
    }

    if (typeof drawVal === "string" && drawVal.startsWith("data:image/")) {
      try {
        const parsed = bytesFromDataUrl(drawVal);
        if (parsed) {
          const embeddedImage = parsed.isPng
            ? await pdfDoc.embedPng(parsed.bytes)
            : await pdfDoc.embedJpg(parsed.bytes);
          page.drawImage(embeddedImage, {
            x: Number(finalCoord.x),
            y: Number(finalCoord.y),
            width: Number(finalCoord.width || 100),
            height: Number(finalCoord.height || 50)
          });
        }
      } catch (err) {
        console.error("Error embedding signature image:", err);
      }
      continue;
    }

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

    let lines = [String(drawVal)];
    if (finalCoord.multiline && finalCoord.maxChars) {
      lines = wrapText(String(drawVal), finalCoord.maxChars);
    } else if (String(drawVal).includes("\n")) {
      lines = String(drawVal).split("\n");
    }

    if (
      finalCoord.width &&
      !finalCoord.multiline &&
      lines.length === 1 &&
      (finalCoord.fitToWidth || (!formConfig.lockFontSize && !finalCoord.lockFontSize))
    ) {
      try {
        const textWidth = currentFont.widthOfTextAtSize(lines[0], currentFontSize);
        const targetWidth = Number(finalCoord.width);
        if (textWidth > targetWidth && targetWidth > 0) {
          const scale = targetWidth / textWidth;
          const minFontSize = finalCoord.fitToWidth ? 4.5 : 6;
          currentFontSize = Math.max(minFontSize, Math.floor(currentFontSize * scale * 10) / 10);
        }
      } catch (err) {
        console.error("Error auto-scaling font size:", err);
      }
    }

    const lineHeight = currentFontSize * 1.2;
    const totalTextHeight = lines.length * lineHeight;
    const boxH = finalCoord.height ? Number(finalCoord.height) : 0;
    const useClip = finalCoord.clip && finalCoord.width && finalCoord.height;

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
      textY = Number(finalCoord.y) + descent + Math.max(0, (boxH - ascent - descent) / 2);
    }

    let initialY = textY;
    if (finalCoord.centerText && finalCoord.height) {
      const capHeight = currentFontSize * 0.7;
      if (lines.length === 1) {
        initialY = Number(finalCoord.y) + Math.max(0, (Number(finalCoord.height) - capHeight) / 2);
      } else {
        initialY =
          Number(finalCoord.y) +
          (Number(finalCoord.height) - totalTextHeight) / 2 +
          (lines.length - 1) * lineHeight;
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

    for (let i = 0; i < lines.length; i += 1) {
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
        color: rgb(0, 0, 0)
      });
    }

    if (useClip) {
      page.pushOperators(popGraphicsState());
    }
  }

  const bytes = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
  return {
    bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    filename: `filled_${formConfig.pdfFile || formId}.pdf`
  };
}

export { formatDateToMonthYear };
