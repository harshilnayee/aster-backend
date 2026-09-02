const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function convertHtmlToPdf() {
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Medical Examination Report</title>
<style>
  @page {
    size: A4;
    margin: 0;
  }

  * {
    box-sizing: border-box;
  }

  body {
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    color: #1a1a1a;
    margin: 0;
    padding: 0;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .sheet {
    position: relative;
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 10mm 11mm 9mm 11mm;
    background: #fff;
    border: 3px solid #a91f16;
  }

  .date-row {
    display: flex;
    justify-content: flex-end;
    font-size: 12px;
    font-weight: 600;
    margin: 0 0 12px;
  }

  .underline-field {
    display: inline-block;
    border-bottom: 1px solid #000;
    min-height: 16px;
    margin-left: 4px;
  }

  .report-title {
    text-align: center;
    font-size: 18px;
    font-weight: 800;
    color: #a91f16;
    margin: 2px 0 16px;
    letter-spacing: 1.2px;
    padding-bottom: 6px;
    border-bottom: 2px solid #a91f16;
    display: inline-block;
  }

  .report-title-wrap {
    text-align: center;
  }

  .field-row {
    display: flex;
    flex-wrap: wrap;
    font-size: 13px;
    margin-bottom: 11px;
    align-items: baseline;
  }

  .field-row .field {
    display: flex;
    align-items: baseline;
    margin-right: 24px;
    flex: 1 1 auto;
  }

  .field label {
    white-space: nowrap;
    font-weight: 600;
    color: #333;
  }

  .field .blank {
    flex: 1;
    border-bottom: 1px solid #555;
    min-height: 16px;
    margin: 0 6px;
  }

  .section-title {
    color: #a91f16;
    font-weight: 700;
    text-align: center;
    font-size: 13px;
    letter-spacing: 0.4px;
    padding: 5px 0;
    margin: 12px 0 10px;
    border-top: 1px solid #ccc;
    border-bottom: 1px solid #ccc;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
    font-size: 12px;
  }

  table.systemic {
    border: 1.5px solid #a91f16;
  }

  table.systemic th,
  table.systemic td {
    border: 1px solid #a91f16;
    text-align: center;
    padding: 7px 4px;
  }

  table.systemic th {
    color: #a91f16;
    font-weight: 700;
    background: #fbeceb;
    font-size: 11.5px;
    letter-spacing: 0.3px;
  }

  table.systemic td {
    height: 32px;
  }

  .abnormality {
    font-size: 11px;
    font-style: italic;
    color: #555;
    margin: 6px 0 14px;
  }

  .abnormality .line {
    display: block;
    border-bottom: 1px solid #555;
    height: 20px;
    margin-top: 5px;
  }

  .past-history-title {
    font-size: 13px;
    font-weight: 700;
    color: #a91f16;
    margin-bottom: 6px;
  }

  .past-history-note {
    font-size: 11px;
    margin-bottom: 6px;
  }

  .past-history-flex {
    display: flex;
    gap: 20px;
  }

  table.history {
    flex: 0 0 60%;
    max-width: 60%;
    border-collapse: collapse;
    font-size: 12px;
    border: 1.5px solid #a91f16;
  }

  table.history th,
  table.history td {
    border: 1px solid #a91f16;
    padding: 6px 9px;
  }

  table.history th {
    color: #a91f16;
    background: #fbeceb;
    font-weight: 700;
    font-size: 11.5px;
  }

  table.history tbody tr:nth-child(even) {
    background: #fdf6f5;
  }

  table.history td.label {
    text-align: left;
    font-weight: 500;
  }

  table.history td.yes,
  table.history td.no {
    text-align: center;
    width: 55px;
    height: 22px;
  }

  .signature-block {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    font-size: 11px;
    font-weight: 700;
    color: #333;
    text-align: center;
    letter-spacing: 0.3px;
  }

  .signature-space {
    height: 110px;
    width: 100%;
    border-bottom: 1.5px solid #555;
    margin-bottom: 8px;
  }

  .remarks-row {
    display: flex;
    align-items: flex-start;
    margin-top: 18px;
    font-size: 13px;
  }

  .remarks-row label {
    font-weight: 700;
    color: #333;
    white-space: nowrap;
    margin-right: 10px;
  }

  .remarks-line {
    flex: 1;
    border-bottom: 1px solid #555;
    height: 18px;
  }
</style>
</head>
<body>

<div class="sheet">
  <div class="date-row">Date : <span class="underline-field" style="width:110px;"></span></div>

  <div class="report-title-wrap"><span class="report-title">MEDICAL EXAMINATION REPORT</span></div>

  <div class="field-row">
    <div class="field" style="flex:2;">
      <label>Name</label><span class="blank"></span>
    </div>
    <div class="field" style="flex:1;">
      <label>Sex :</label><span class="blank"></span>
    </div>
  </div>

  <div class="field-row">
    <div class="field" style="flex:1;">
      <label>Company Name :</label><span class="blank"></span>
    </div>
  </div>

  <div class="field-row">
    <div class="field" style="flex:1;">
      <label>Age :</label><span class="blank"></span><label>Yrs.</label>
    </div>
    <div class="field" style="flex:1;">
      <label>Department :</label><span class="blank"></span>
    </div>
  </div>

  <div class="field-row">
    <div class="field" style="flex:2;">
      <label>Identification Mark :</label><span class="blank"></span>
    </div>
    <div class="field" style="flex:1;">
      <label>Blood Group :</label><span class="blank" style="max-width:60px;"></span><label>Ve</label>
    </div>
  </div>

  <div class="section-title">General Examination</div>

  <div class="field-row">
    <div class="field" style="flex:1;">
      <label>Height</label><span class="blank"></span><label>cms</label>
    </div>
    <div class="field" style="flex:1;">
      <label>Weight :</label><span class="blank"></span><label>Kgs.</label>
    </div>
    <div class="field" style="flex:1;">
      <label>Temp</label><span class="blank"></span><label>0 c</label>
    </div>
  </div>

  <div class="field-row">
    <div class="field" style="flex:1;">
      <label>Pulse :</label><span class="blank"></span><label>/mm</label>
    </div>
    <div class="field" style="flex:1;">
      <label>B.P. (Sys.)</label><span class="blank"></span>
    </div>
    <div class="field" style="flex:1;">
      <label>(Dys.)</label><span class="blank"></span><label>mm/Hg.</label>
    </div>
  </div>

  <div class="field-row">
    <div class="field" style="flex:1;">
      <label>Vaccinated as per Indian Vaccianation schedule :</label><label>Yes / No</label>
    </div>
  </div>

  <div class="section-title">Systemic Examination</div>

  <table class="systemic">
    <thead>
      <tr>
        <th>R.S.</th>
        <th>C.V.S.</th>
        <th>C.N.S.</th>
        <th>P/A</th>
        <th>VISION</th>
        <th>SKIN</th>
        <th>ENT</th>
        <th>NAILS</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <div class="abnormality">
    Describe the details of abnormality here
    <span class="line"></span>
  </div>

  <div class="past-history-title">Past History : (Please in appropriate boxes in case of details, mention in blank protion)</div>

  <div class="past-history-flex">
    <table class="history">
      <thead>
        <tr>
          <th>Past history of</th>
          <th>Yes</th>
          <th>No.</th>
        </tr>
      </thead>
      <tbody>
        <tr><td class="label">T.B.</td><td class="yes"></td><td class="no"></td></tr>
        <tr><td class="label">JAUNDICE</td><td class="yes"></td><td class="no"></td></tr>
        <tr><td class="label">ASTHMA</td><td class="yes"></td><td class="no"></td></tr>
        <tr><td class="label">BRONCHITS</td><td class="yes"></td><td class="no"></td></tr>
        <tr><td class="label">ACCIDENT</td><td class="yes"></td><td class="no"></td></tr>
        <tr><td class="label">OPERATION</td><td class="yes"></td><td class="no"></td></tr>
        <tr><td class="label">BLOOD TRANSFUSION</td><td class="yes"></td><td class="no"></td></tr>
        <tr><td class="label">CHOLERA</td><td class="yes"></td><td class="no"></td></tr>
        <tr><td class="label">ALLERGY</td><td class="yes"></td><td class="no"></td></tr>
        <tr><td class="label">SKIN DISEASE</td><td class="yes"></td><td class="no"></td></tr>
        <tr><td class="label">CONTAGIOUS DISEASE</td><td class="yes"></td><td class="no"></td></tr>
      </tbody>
    </table>

    <div class="signature-block">
      <div class="signature-space"></div>
      <div>SIGN &amp; STAMP OF PHYSICIAN</div>
    </div>
  </div>

  <div class="remarks-row">
    <label>REMARKS :</label>
    <span class="remarks-line"></span>
  </div>
</div>

</body>
</html>`;

  console.log("Launching Chromium via Playwright...");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle' });

  const targetPath1 = path.join(__dirname, '../all forms/medical_examination_report.pdf');
  const targetPath2 = path.join(__dirname, '../../all forms/medical_examination_report.pdf');

  console.log("Generating A4 PDF...");
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' }
  });

  fs.writeFileSync(targetPath1, pdfBuffer);
  fs.writeFileSync(targetPath2, pdfBuffer);
  await browser.close();

  console.log("Successfully generated pixel-perfect HTML->PDF medical_examination_report.pdf!");
}

convertHtmlToPdf().catch((err) => {
  console.error("HTML to PDF conversion failed:", err);
  process.exit(1);
});
