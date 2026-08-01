const mongoose = require("mongoose");
require("dotenv").config();
const Patient = require("../models/Patient");

const NEW_ADDRESS = "AT. VADPURA, KALOL-MEHSANA HIGHWAY, OPP. NAVJIVAN HOTEL, TA. KADI, DIST. MEHSANA - 382705";

async function main() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const query = { company: { $regex: /GANESH AGRO/i } };
    
    const patientsBefore = await Patient.find(query).select("patientId name company companyAddress");
    console.log(`Found ${patientsBefore.length} patients matching 'GANESH AGRO'.`);

    if (patientsBefore.length > 0) {
      console.log("Sample before update:", patientsBefore.slice(0, 5));
      
      const result = await Patient.updateMany(query, {
        $set: { companyAddress: NEW_ADDRESS }
      });

      console.log(`Update result: ${result.modifiedCount} patients updated.`);
    } else {
      // Let's also check all distinct company names in the database to see exact string
      const distinctCompanies = await Patient.distinct("company");
      console.log("All distinct companies in database:", distinctCompanies);
    }

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
