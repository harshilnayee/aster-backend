const mongoose = require("mongoose");
const User = require("../models/User");
require("dotenv").config();

async function updateAdminAccount() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    let user = await User.findOne({ email: { $in: ["admin@astermedcare.com", "admin@drsvl.com"] } });
    if (!user) {
      console.log("No existing admin found. Creating new admin user admin@drsvl.com...");
      user = new User({
        name: "System Admin",
        email: "admin@drsvl.com",
        role: "admin",
        isActive: true
      });
    }

    user.email = "admin@drsvl.com";
    user.password = "AdminSajan@2026";
    await user.save();

    console.log("SUCCESS: Admin account updated to admin@drsvl.com with password AdminSajan@2026!");
    process.exit(0);
  } catch (err) {
    console.error("ERROR updating admin account:", err);
    process.exit(1);
  }
}

updateAdminAccount();
