require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

const DEMO_ACCOUNTS_TO_REMOVE = [
  "doctor@astermedcare.com",
  "staff1@astermedcare.com",
  "staff2@astermedcare.com"
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  for (const email of DEMO_ACCOUNTS_TO_REMOVE) {
    const result = await User.deleteOne({ email });
    if (result.deletedCount) {
      console.log("Removed:", email);
    } else {
      console.log("Not found (skipped):", email);
    }
  }

  const remaining = await User.find({}).select("email role name").sort({ email: 1 });
  console.log("Remaining users:");
  remaining.forEach((u) => console.log(`  ${u.email} (${u.role}) — ${u.name}`));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
