const { chromium } = require("playwright");

const pastHistoryItems = [
  ["tb", "T.B."],
  ["jaundice", "JAUNDICE"],
  ["asthma", "ASTHMA"],
  ["bronchitis", "BRONCHITS"],
  ["accident", "ACCIDENT"],
  ["operation", "OPERATION"],
  ["bloodTransfusion", "BLOOD TRANSFUSION"],
  ["cholera", "CHOLERA"],
  ["allergy", "ALLERGY"],
  ["skinDisease", "SKIN DISEASE"],
  ["contagiousDisease", "CONTAGIOUS DISEASE"]
];

let browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function checkMark(value, expected) {
  return String(value || "").toUpperCase() === expected ? "✓" : "";
}

function buildMedicalExamReportHtml(values = {}) {
  const historyRows = pastHistoryItems
    .map(([key, label]) => {
      return `<tr>
        <td class="label">${escapeHtml(label)}</td>
        <td class="yes">${checkMark(values[key], "YES")}</td>
        <td class="no">${checkMark(values[key], "NO")}</td>
      </tr>`;
    })
    .join("");

  const signature = values.signaturePhysician || values.doctorSignature || "";
  const signatureHtml = signature
    ? `<img src="${escapeHtml(signature)}" alt="Doctor Signature" class="signature-image" />`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Medical Examination Report</title>
<style>
  @page {
    size: A4;
    margin: 12mm;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: #fff;
    color: #1a1a1a;
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .med-exam-sheet {
    position: relative;
    width: 100%;
    max-width: 210mm;
    margin: 0 auto;
    padding: 10mm 11mm 9mm 11mm;
    background: #fff;
    border: 3px solid #a91f16;
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    color: #1a1a1a;
    box-sizing: border-box;
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
    padding: 0 4px;
    font-weight: 700;
  }

  .report-title-wrap {
    text-align: center;
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
    padding: 0 6px;
    font-weight: 700;
    color: #1a1a1a;
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
    font-weight: 700;
    color: #1a1a1a;
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
    min-height: 20px;
    margin-top: 5px;
    font-style: normal;
    font-weight: 700;
    color: #1a1a1a;
    padding: 2px 6px 0;
  }

  .past-history-title {
    font-size: 13px;
    font-weight: 700;
    color: #a91f16;
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
    font-weight: 600;
  }

  table.history td.yes,
  table.history td.no {
    text-align: center;
    width: 55px;
    height: 22px;
    font-weight: 800;
    font-size: 13px;
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
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .signature-image {
    max-height: 96px;
    max-width: 100%;
    object-fit: contain;
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
    min-height: 18px;
    font-weight: 700;
    color: #1a1a1a;
    padding-left: 6px;
  }
</style>
</head>
<body>
  <div class="med-exam-sheet">
    <div class="date-row">
      Date : <span class="underline-field" style="width: 110px">${escapeHtml(values.date)}</span>
    </div>

    <div class="report-title-wrap">
      <span class="report-title">MEDICAL EXAMINATION REPORT</span>
    </div>

    <div class="field-row">
      <div class="field" style="flex: 2">
        <label>Name</label>
        <span class="blank">${escapeHtml(values.name)}</span>
      </div>
      <div class="field" style="flex: 1">
        <label>Sex :</label>
        <span class="blank">${escapeHtml(values.gender)}</span>
      </div>
    </div>

    <div class="field-row">
      <div class="field" style="flex: 1">
        <label>Company Name :</label>
        <span class="blank">${escapeHtml(values.companyName)}</span>
      </div>
    </div>

    <div class="field-row">
      <div class="field" style="flex: 1">
        <label>Age :</label>
        <span class="blank">${escapeHtml(values.age)}</span>
        <label>Yrs.</label>
      </div>
      <div class="field" style="flex: 1">
        <label>Department :</label>
        <span class="blank">${escapeHtml(values.department)}</span>
      </div>
    </div>

    <div class="field-row">
      <div class="field" style="flex: 2">
        <label>Identification Mark :</label>
        <span class="blank">${escapeHtml(values.identificationMark)}</span>
      </div>
      <div class="field" style="flex: 1">
        <label>Blood Group :</label>
        <span class="blank" style="max-width: 60px">${escapeHtml(values.bloodGroup)}</span>
        <label>${escapeHtml(values.rhType || "Ve")}</label>
      </div>
    </div>

    <div class="section-title">General Examination</div>

    <div class="field-row">
      <div class="field" style="flex: 1">
        <label>Height</label>
        <span class="blank">${escapeHtml(values.height)}</span>
        <label>cms</label>
      </div>
      <div class="field" style="flex: 1">
        <label>Weight :</label>
        <span class="blank">${escapeHtml(values.weight)}</span>
        <label>Kgs.</label>
      </div>
      <div class="field" style="flex: 1">
        <label>Temp</label>
        <span class="blank">${escapeHtml(values.temperature)}</span>
        <label>0 c</label>
      </div>
    </div>

    <div class="field-row">
      <div class="field" style="flex: 1">
        <label>Pulse :</label>
        <span class="blank">${escapeHtml(values.pulse)}</span>
        <label>/mm</label>
      </div>
      <div class="field" style="flex: 1">
        <label>B.P. (Sys.)</label>
        <span class="blank">${escapeHtml(values.bpSystolic)}</span>
      </div>
      <div class="field" style="flex: 1">
        <label>(Dys.)</label>
        <span class="blank">${escapeHtml(values.bpDiastolic)}</span>
        <label>mm/Hg.</label>
      </div>
    </div>

    <div class="field-row">
      <div class="field" style="flex: 1">
        <label>Vaccinated as per Indian Vaccianation schedule :</label>
        <label style="margin-left: 8px; font-weight: 700">${escapeHtml(values.vaccinated || "Yes")}</label>
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
          <td>${escapeHtml(values.rs)}</td>
          <td>${escapeHtml(values.cvs)}</td>
          <td>${escapeHtml(values.cns)}</td>
          <td>${escapeHtml(values.pa)}</td>
          <td>${escapeHtml(values.vision)}</td>
          <td>${escapeHtml(values.skin)}</td>
          <td>${escapeHtml(values.ent)}</td>
          <td>${escapeHtml(values.nails)}</td>
        </tr>
      </tbody>
    </table>

    <div class="abnormality">
      Describe the details of abnormality here
      <span class="line">${escapeHtml(values.abnormalityDetails)}</span>
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
        <tbody>${historyRows}</tbody>
      </table>

      <div class="signature-block">
        <div class="signature-space">${signatureHtml}</div>
        <div>SIGN &amp; STAMP OF PHYSICIAN</div>
      </div>
    </div>

    <div class="remarks-row">
      <label>REMARKS :</label>
      <span class="remarks-line">${escapeHtml(values.remarks)}</span>
    </div>
  </div>
</body>
</html>`;
}

async function renderMedicalExamReportPdf(values) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(buildMedicalExamReportHtml(values), { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

module.exports = {
  buildMedicalExamReportHtml,
  renderMedicalExamReportPdf
};
