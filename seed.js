const mongoose = require("mongoose");
const User = require("./models/User");
require("dotenv").config();

const ALL_FORMS = [
  "postMedical", "eyeExam", "form33", "healthRegister", "xrayReport",
  "form6", "form7", "form8", "form9", "form10",
  "form11", "form12", "form13", "form14", "form15",
  "form16", "form17", "form18", "form19", "form20",
  "form21", "form22", "form23", "form24"
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
