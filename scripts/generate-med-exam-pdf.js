const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

async function generateMedExamPdf() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const maroon = rgb(169 / 255, 31 / 255, 22 / 255);
  const darkText = rgb(0.1, 0.1, 0.1);
  const lineGrey = rgb(0.33, 0.33, 0.33);
  const lightGrey = rgb(0.8, 0.8, 0.8);
  const pinkBg = rgb(251 / 255, 236 / 255, 235 / 255);
  const pinkAltRow = rgb(253 / 255, 246 / 255, 245 / 255);

  // Outer Maroon Border
  page.drawRectangle({
    x: 25,
    y: 20,
    width: 545.28,
    height: 801.89,
    borderColor: maroon,
    borderWidth: 3
  });

  // Date Row
  page.drawText("Date :", { x: 410, y: 795, size: 10, font: fontBold, color: darkText });
  page.drawLine({ start: { x: 445, y: 793 }, end: { x: 550, y: 793 }, thickness: 1, color: lineGrey });

  // Title
  const titleText = "MEDICAL EXAMINATION REPORT";
  const titleWidth = fontBold.widthOfTextAtSize(titleText, 16);
  const titleX = (595.28 - titleWidth) / 2;
  page.drawText(titleText, { x: titleX, y: 765, size: 16, font: fontBold, color: maroon });
  page.drawLine({ start: { x: titleX - 10, y: 757 }, end: { x: titleX + titleWidth + 10, y: 757 }, thickness: 2, color: maroon });

  // Demographics Row 1: Name & Sex
  page.drawText("Name :", { x: 45, y: 730, size: 10, font: fontBold, color: darkText });
  page.drawLine({ start: { x: 85, y: 728 }, end: { x: 380, y: 728 }, thickness: 1, color: lineGrey });
  page.drawText("Sex :", { x: 400, y: 730, size: 10, font: fontBold, color: darkText });
  page.drawLine({ start: { x: 435, y: 728 }, end: { x: 550, y: 728 }, thickness: 1, color: lineGrey });

  // Demographics Row 2: Company Name
  page.drawText("Company Name :", { x: 45, y: 705, size: 10, font: fontBold, color: darkText });
  page.drawLine({ start: { x: 140, y: 703 }, end: { x: 550, y: 703 }, thickness: 1, color: lineGrey });

  // Demographics Row 3: Age & Department
  page.drawText("Age :", { x: 45, y: 680, size: 10, font: fontBold, color: darkText });
  page.drawLine({ start: { x: 78, y: 678 }, end: { x: 260, y: 678 }, thickness: 1, color: lineGrey });
  page.drawText("Yrs.", { x: 265, y: 680, size: 10, font: fontBold, color: darkText });
  page.drawText("Department :", { x: 320, y: 680, size: 10, font: fontBold, color: darkText });
  page.drawLine({ start: { x: 395, y: 678 }, end: { x: 550, y: 678 }, thickness: 1, color: lineGrey });

  // Demographics Row 4: Identification Mark & Blood Group
  page.drawText("Identification Mark :", { x: 45, y: 655, size: 10, font: fontBold, color: darkText });
  page.drawLine({ start: { x: 155, y: 653 }, end: { x: 360, y: 653 }, thickness: 1, color: lineGrey });
  page.drawText("Blood Group :", { x: 380, y: 655, size: 10, font: fontBold, color: darkText });
  page.drawLine({ start: { x: 455, y: 653 }, end: { x: 515, y: 653 }, thickness: 1, color: lineGrey });
  page.drawText("Ve", { x: 520, y: 655, size: 10, font: fontBold, color: darkText });

  // Section Title 1: General Examination
  page.drawLine({ start: { x: 45, y: 635 }, end: { x: 550, y: 635 }, thickness: 1, color: lightGrey });
  page.drawLine({ start: { x: 45, y: 615 }, end: { x: 550, y: 615 }, thickness: 1, color: lightGrey });
  const genText = "General Examination";
  const genWidth = fontBold.widthOfTextAtSize(genText, 11);
  page.drawText(genText, { x: (595.28 - genWidth) / 2, y: 621, size: 11, font: fontBold, color: maroon });

  // General Exam Row 1: Height, Weight, Temp
  page.drawText("Height :", { x: 45, y: 593, size: 10, font: fontBold, color: darkText });
  page.drawLine({ start: { x: 90, y: 591 }, end: { x: 185, y: 591 }, thickness: 1, color: lineGrey });
  page.drawText("cms", { x: 190, y: 593, size: 10, font: fontBold, color: darkText });

  page.drawText("Weight :", { x: 240, y: 593, size: 10, font: fontBold, color: darkText });
  page.drawLine({ start: { x: 290, y: 591 }, end: { x: 365, y: 591 }, thickness: 1, color: lineGrey });
  page.drawText("Kgs.", { x: 370, y: 593, size: 10, font: fontBold, color: darkText });

  page.drawText("Temp :", { x: 420, y: 593, size: 10, font: fontBold, color: darkText });
  page.drawLine({ start: { x: 460, y: 591 }, end: { x: 520, y: 591 }, thickness: 1, color: lineGrey });
  page.drawText("0 c", { x: 525, y: 593, size: 10, font: fontBold, color: darkText });

  // General Exam Row 2: Pulse, B.P. Sys, Dys
  page.drawText("Pulse :", { x: 45, y: 568, size: 10, font: fontBold, color: darkText });
  page.drawLine({ start: { x: 85, y: 566 }, end: { x: 180, y: 566 }, thickness: 1, color: lineGrey });
  page.drawText("/mm", { x: 185, y: 568, size: 10, font: fontBold, color: darkText });

  page.drawText("B.P. (Sys.) :", { x: 230, y: 568, size: 10, font: fontBold, color: darkText });
  page.drawLine({ start: { x: 295, y: 566 }, end: { x: 375, y: 566 }, thickness: 1, color: lineGrey });

  page.drawText("(Dys.) :", { x: 395, y: 568, size: 10, font: fontBold, color: darkText });
  page.drawLine({ start: { x: 435, y: 566 }, end: { x: 500, y: 566 }, thickness: 1, color: lineGrey });
  page.drawText("mm/Hg.", { x: 505, y: 568, size: 10, font: fontBold, color: darkText });

  // General Exam Row 3: Vaccinated
  page.drawText("Vaccinated as per Indian Vaccianation schedule :", { x: 45, y: 543, size: 10, font: fontBold, color: darkText });
  page.drawText("Yes / No", { x: 310, y: 543, size: 10, font: fontBold, color: darkText });

  // Section Title 2: Systemic Examination
  page.drawLine({ start: { x: 45, y: 525 }, end: { x: 550, y: 525 }, thickness: 1, color: lightGrey });
  page.drawLine({ start: { x: 45, y: 505 }, end: { x: 550, y: 505 }, thickness: 1, color: lightGrey });
  const sysText = "Systemic Examination";
  const sysWidth = fontBold.widthOfTextAtSize(sysText, 11);
  page.drawText(sysText, { x: (595.28 - sysWidth) / 2, y: 511, size: 11, font: fontBold, color: maroon });

  // Systemic Examination Table (Header + Value Row)
  const sysTableX = 45;
  const sysTableY = 450;
  const sysTableW = 505;
  const sysTableH = 46;
  const sysColW = sysTableW / 8;

  // Background for Header
  page.drawRectangle({
    x: sysTableX,
    y: sysTableY + 23,
    width: sysTableW,
    height: 23,
    color: pinkBg
  });

  // Table Outer Border
  page.drawRectangle({
    x: sysTableX,
    y: sysTableY,
    width: sysTableW,
    height: sysTableH,
    borderColor: maroon,
    borderWidth: 1.5
  });

  // Horizontal divider
  page.drawLine({
    start: { x: sysTableX, y: sysTableY + 23 },
    end: { x: sysTableX + sysTableW, y: sysTableY + 23 },
    thickness: 1,
    color: maroon
  });

  const sysCols = ["R.S.", "C.V.S.", "C.N.S.", "P/A", "VISION", "SKIN", "ENT", "NAILS"];
  sysCols.forEach((colLabel, idx) => {
    const colX = sysTableX + idx * sysColW;
    if (idx > 0) {
      page.drawLine({
        start: { x: colX, y: sysTableY },
        end: { x: colX, y: sysTableY + sysTableH },
        thickness: 1,
        color: maroon
      });
    }
    const labelW = fontBold.widthOfTextAtSize(colLabel, 9.5);
    page.drawText(colLabel, {
      x: colX + (sysColW - labelW) / 2,
      y: sysTableY + 29,
      size: 9.5,
      font: fontBold,
      color: maroon
    });
  });

  // Abnormality Details
  page.drawText("Describe the details of abnormality here", { x: 45, y: 432, size: 9, font: fontOblique, color: rgb(0.35, 0.35, 0.35) });
  page.drawLine({ start: { x: 45, y: 412 }, end: { x: 550, y: 412 }, thickness: 1, color: lineGrey });

  // Past History Title
  page.drawText("Past History : (Please in appropriate boxes in case of details, mention in blank protion)", {
    x: 45,
    y: 392,
    size: 10,
    font: fontBold,
    color: maroon
  });

  // Past History Table
  const histX = 45;
  const histY = 95;
  const histW = 320;
  const histH = 280;
  const rowH = histH / 12; // 1 header + 11 rows = 12 rows (~23.3pt each)

  // Table Outer Border
  page.drawRectangle({
    x: histX,
    y: histY,
    width: histW,
    height: histH,
    borderColor: maroon,
    borderWidth: 1.5
  });

  // Header Background
  page.drawRectangle({
    x: histX,
    y: histY + 11 * rowH,
    width: histW,
    height: rowH,
    color: pinkBg
  });

  // Columns: Past history of (200pt), Yes (60pt), No. (60pt)
  const col1W = 200;
  const col2W = 60;
  const col3W = 60;

  // Header Text
  page.drawText("Past history of", { x: histX + 10, y: histY + 11 * rowH + 7, size: 9.5, font: fontBold, color: maroon });
  page.drawText("Yes", { x: histX + col1W + (col2W - fontBold.widthOfTextAtSize("Yes", 9.5)) / 2, y: histY + 11 * rowH + 7, size: 9.5, font: fontBold, color: maroon });
  page.drawText("No.", { x: histX + col1W + col2W + (col3W - fontBold.widthOfTextAtSize("No.", 9.5)) / 2, y: histY + 11 * rowH + 7, size: 9.5, font: fontBold, color: maroon });

  // Vertical Column Dividers
  page.drawLine({ start: { x: histX + col1W, y: histY }, end: { x: histX + col1W, y: histY + histH }, thickness: 1, color: maroon });
  page.drawLine({ start: { x: histX + col1W + col2W, y: histY }, end: { x: histX + col1W + col2W, y: histY + histH }, thickness: 1, color: maroon });

  const historyLabels = [
    "T.B.",
    "JAUNDICE",
    "ASTHMA",
    "BRONCHITS",
    "ACCIDENT",
    "OPERATION",
    "BLOOD TRANSFUSION",
    "CHOLERA",
    "ALLERGY",
    "SKIN DISEASE",
    "CONTAGIOUS DISEASE"
  ];

  historyLabels.forEach((label, idx) => {
    const rY = histY + (10 - idx) * rowH;
    // Horizontal row line
    page.drawLine({ start: { x: histX, y: rY }, end: { x: histX + histW, y: rY }, thickness: 1, color: maroon });

    // Alternating pink row background
    if (idx % 2 === 1) {
      page.drawRectangle({
        x: histX + 1,
        y: rY + 1,
        width: histW - 2,
        height: rowH - 2,
        color: pinkAltRow
      });
    }

    page.drawText(label, { x: histX + 10, y: rY + 7, size: 9, font: font, color: darkText });
  });

  // Signature Block (Right side of Past History Table)
  const sigX = 390;
  const sigW = 160;
  page.drawLine({ start: { x: sigX, y: 125 }, end: { x: sigX + sigW, y: 125 }, thickness: 1.5, color: lineGrey });
  const sigText = "SIGN & STAMP OF PHYSICIAN";
  const sigTextW = fontBold.widthOfTextAtSize(sigText, 8.5);
  page.drawText(sigText, { x: sigX + (sigW - sigTextW) / 2, y: 110, size: 8.5, font: fontBold, color: darkText });

  // Remarks Row
  page.drawText("REMARKS :", { x: 45, y: 65, size: 10, font: fontBold, color: darkText });
  page.drawLine({ start: { x: 120, y: 63 }, end: { x: 550, y: 63 }, thickness: 1, color: lineGrey });

  const pdfBytes = await pdfDoc.save();
  const outPath1 = path.join(__dirname, "../all forms/medical_examination_report.pdf");
  const outPath2 = path.join(__dirname, "../../all forms/medical_examination_report.pdf");

  fs.writeFileSync(outPath1, pdfBytes);
  if (fs.existsSync(path.dirname(outPath2))) {
    fs.writeFileSync(outPath2, pdfBytes);
  }
  console.log("Successfully generated medical_examination_report.pdf!");
}

generateMedExamPdf().catch((err) => {
  console.error("Failed to generate PDF template:", err);
  process.exit(1);
});
