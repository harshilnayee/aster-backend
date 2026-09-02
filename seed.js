const mongoose = require("mongoose");
const User = require("./models/User");
require("dotenv").config();

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run seed.js in production (hardcoded passwords / user deletes).");
  process.exit(1);
}

const ALL_FORMS = [
  "preMedical", "postMedical", "eyeExam", "form33", "healthRegister", "xrayReport",
  "4-form-airport-bohw", "5-form-height-pass", "10-form-ophthal-form-6",
  "form09", "form10",
  "11-form-audiometry-front", "12-form-audiometry-back", "13-form-pft-front", "14-form-pft-back", "15-form-vaccination-front",
  "16-form-vaccination-back", "17-form-food-handler-certificate", "18-form-vaccine-ircs-forms-2", "19-form-ecg", "25-form-for-medical-fitness-certificate-format", "26-form-death-certificate",
  "35-form-airport-bohw-ht-front", "36-form-airport-bohw-ht-back", "form23", "medicalExamReport", "newfrom26"
];

const usersToSeed = [
  {
    name: "System Admin",
    email: "admin@drsvl.com",
    password: "AdminSajan@2026", // String password will be hashed by UserSchema pre('save') hook
    role: "admin",
    formAccess: ALL_FORMS,
    isActive: true
  }
];

async function seedDatabase() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error("Error: MONGO_URI is not defined in environment variables.");
    process.exit(1);
  }

  try {
    console.log("Connecting to database for seeding...");
    console.log("Connecting to:", MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log("Database connection successful.");

    for (const userData of usersToSeed) {
      // Delete existing user if any
      await User.deleteOne({ email: userData.email });
      
      // Create user (this triggers mongoose pre('save') password hashing)
      const newUser = new User(userData);
      await newUser.save();
      console.log(`Seeded user: ${userData.email} (Role: ${userData.role})`);
    }

    console.log("Database seeding completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Database seeding failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  seedDatabase();
} else {
  module.exports = { seedDatabase };
}
