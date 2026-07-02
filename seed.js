const mongoose = require("mongoose");
const User = require("./models/User");
require("dotenv").config();

const ALL_FORMS = [
  "preMedical", "postMedical", "eyeExam", "form33", "healthRegister", "xrayReport",
  "4-form-airport-bohw", "5-form-height-pass", "10-form-ophthal-form-6",
  "form9", "form10",
  "11-form-audiometry-front", "12-form-audiometry-back", "13-form-pft-front", "14-form-pft-back", "15-form-vaccination-front",
  "16-form-vaccination-back", "17-form-food-handler-certificate", "18-form-vaccine-ircs-forms-2", "25-form-for-medical-fitness-certificate-format", "26-form-death-certificate",
  "35-form-airport-bohw-ht-front", "36-form-airport-bohw-ht-back", "form23"
];

const usersToSeed = [
  {
    name: "System Admin",
    email: "admin@astermedcare.com",
    password: "admin123", // String password will be hashed by UserSchema pre('save') hook
    role: "admin",
    formAccess: ALL_FORMS,
    isActive: true
  },
  {
    name: "Doctor Patel",
    email: "doctor@astermedcare.com",
    password: "doctor123",
    role: "doctor",
    formAccess: ALL_FORMS,
    isActive: true
  },
  {
    name: "Staff Member One",
    email: "staff1@astermedcare.com",
    password: "staff123",
    role: "employee",
    formAccess: ["eyeExam", "postMedical"], // default access to two forms for immediate testing
    isActive: true
  },
  {
    name: "Staff Member Two",
    email: "staff2@astermedcare.com",
    password: "staff123",
    role: "employee",
    formAccess: [], // default empty formAccess
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

seedDatabase();
