require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

const ALL_FORMS = [
  "preMedical", "postMedical", "eyeExam", "form33", "healthRegister", "xrayReport",
  "4-form-airport-bohw", "5-form-height-pass", "10-form-ophthal-form-6",
  "form09", "form10", "11-form-audiometry-front", "12-form-audiometry-back",
  "13-form-pft-front", "14-form-pft-back", "15-form-vaccination-front",
  "16-form-vaccination-back", "17-form-food-handler-certificate",
  "18-form-vaccine-ircs-forms-2", "19-form-ecg", "25-form-for-medical-fitness-certificate-format",
  "26-form-death-certificate", "35-form-airport-bohw-ht-front", "36-form-airport-bohw-ht-back", "form23", "medicalExamReport"
];

async function main() {
  const email = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!email || !password) {
    console.error("Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD in server/.env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  let user = await User.findOne({ email });
  if (user) {
    user.role = "superadmin";
    user.formAccess = ALL_FORMS;
    user.isActive = true;
    user.password = password;
    await user.save();
    console.log("Upgraded existing account to superadmin:", email);
  } else {
    user = new User({
      name: process.env.SUPERADMIN_NAME || "Platform Developer",
      email,
      password,
      role: "superadmin",
      formAccess: ALL_FORMS,
      isActive: true
    });
    await user.save();
    console.log("Created superadmin account:", email);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
