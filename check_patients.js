const mongoose = require("mongoose");
require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI;

const PatientSchema = new mongoose.Schema({}, { strict: false });
const Patient = mongoose.model("Patient", PatientSchema);

// Filter values
const reportStart = "2026-07-06";
const reportEnd = "2026-07-09";
const reportCompany = "C.L.R.F.S";
const reportForm = "35-form-airport-bohw-ht-front";

async function check() {
  try {
    console.log("Connecting...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected.");

    const patients = await Patient.find({});
    console.log("Total patients in database:", patients.length);

    const reportData = [];
    patients.forEach(patient => {
      // Filter by company
      if (reportCompany !== "All" && patient.company !== reportCompany) {
        return;
      }

      const forms = patient.forms || {};
      Object.entries(forms).forEach(([formKey, formData]) => {
        // If the form wasn't completed, skip
        if (!formData?.savedAt) return;

        // If a specific form was selected, check if this matches
        if (reportForm !== "All" && formKey !== reportForm) {
          return;
        }

        // Timezone-safe local YYYY-MM-DD conversion
        const d = new Date(formData.savedAt);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const savedDateStr = `${yyyy}-${mm}-${dd}`;

        if (reportStart && savedDateStr < reportStart) return;
        if (reportEnd && savedDateStr > reportEnd) return;

        reportData.push({
          patientId: patient.patientId,
          name: patient.name,
          company: patient.company,
          formKey,
          savedDateStr
        });
      });
    });

    console.log("Matched report rows count:", reportData.length);
    console.log("Matched report rows:", reportData.slice(0, 5));

    await mongoose.connection.close();
  } catch (err) {
    console.error("Error:", err);
  }
}

check();
