require("dotenv").config();
const mongoose = require("mongoose");
const Patient = require("../models/Patient");
const Clinic = require("../models/Clinic");

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI environment variable is required.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB for sample patient cleanup...");

  // 1. Tag any existing sample patients by name matching '(Sample)'
  const tagResult = await Patient.updateMany(
    { name: { $regex: /\(Sample\)$/i }, isSample: { $ne: true } },
    { $set: { isSample: true } }
  );
  console.log(`Tagged ${tagResult.modifiedCount} existing sample patients with isSample: true.`);

  // 2. Count total sample patients across database
  const totalSamples = await Patient.countDocuments({
    $or: [{ isSample: true }, { name: { $regex: /\(Sample\)$/i } }]
  });
  console.log(`Total sample patients in DB: ${totalSamples}`);

  // 3. Find default / primary clinic
  const defaultClinic = await Clinic.findOne().sort({ createdAt: 1 });
  if (defaultClinic) {
    console.log(`Default primary clinic: ${defaultClinic.name} (${defaultClinic._id})`);
    
    // Ensure all non-sample patients without clinicId belong to primary clinic
    const repairedResult = await Patient.updateMany(
      {
        $or: [{ clinicId: null }, { clinicId: { $exists: false } }],
        isSample: { $ne: true },
        name: { $not: /\(Sample\)$/i }
      },
      { $set: { clinicId: defaultClinic._id } }
    );
    console.log(`Assigned primary clinicId to ${repairedResult.modifiedCount} main worker records.`);
  }

  await mongoose.disconnect();
  console.log("Cleanup script completed successfully.");
}

main().catch((err) => {
  console.error("Cleanup error:", err);
  process.exit(1);
});
