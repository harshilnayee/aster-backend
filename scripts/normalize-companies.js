const mongoose = require("mongoose");
const Patient = require("../models/Patient");
require("dotenv").config();

async function normalizeCompanies() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    // Unify Ajita Sil Chem variations
    const result1 = await Patient.updateMany(
      { company: "Ajita Sil Chem Pvt. Ltd." },
      { $set: { company: "AJITA SIL-CHEM PVT. LTD." } }
    );
    console.log(`Updated ${result1.modifiedCount} patients from 'Ajita Sil Chem Pvt. Ltd.' -> 'AJITA SIL-CHEM PVT. LTD.'`);

    // Verify total count under unified name
    const totalCount = await Patient.countDocuments({ company: "AJITA SIL-CHEM PVT. LTD." });
    console.log(`Total workers now under 'AJITA SIL-CHEM PVT. LTD.': ${totalCount}`);

    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

normalizeCompanies();
