require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const Clinic = require("../models/Clinic");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB...");

  const defaultClinic = await Clinic.findOne({ slug: "drsvl" }) || await Clinic.findOne().sort({ createdAt: 1 });
  if (!defaultClinic) {
    console.error("No default clinic found!");
    process.exit(1);
  }

  console.log("Primary Clinic ID:", defaultClinic._id, defaultClinic.name);

  // Assign primary clinic to admin users without clinicId
  const result = await User.updateMany(
    {
      role: { $in: ["admin", "doctor", "employee"] },
      $or: [{ clinicId: null }, { clinicId: { $exists: false } }]
    },
    { $set: { clinicId: defaultClinic._id } }
  );

  console.log(`Updated ${result.modifiedCount} user accounts with primary clinicId.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
