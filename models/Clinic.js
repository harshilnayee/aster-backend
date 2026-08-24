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
    formFieldRules: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    exportPrefs: {
      stampMode: {
        type: String,
        enum: ["fill", "handwrite"],
        default: "fill"
      },
      emptyFieldMode: {
        type: String,
        enum: ["blank", "NA"],
        default: "blank"
      },
      includeUnsavedForms: {
        type: Boolean,
        default: true
      },
      defaultExportMode: {
        type: String,
        enum: ["zip", "merged-pdf"],
        default: "zip"
      }
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
