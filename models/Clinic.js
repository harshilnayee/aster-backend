const mongoose = require("mongoose");

const ClinicSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: [true, "Clinic slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9_]+$/, "Slug can only contain lowercase letters, numbers, and underscores"]
    },
    name: {
      type: String,
      required: [true, "Clinic name is required"],
      trim: true
    },
    address: {
      type: String,
      default: "",
      trim: true
    },
    doctorName: {
      type: String,
      default: "",
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Clinic", ClinicSchema);
