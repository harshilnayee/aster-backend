const mongoose = require("mongoose");

const AccessRequestSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true
    },
    name: {
      type: String,
      required: [true, "Doctor / Admin Name is required"],
      trim: true
    },
    clinicName: {
      type: String,
      required: [true, "Clinic Name is required"],
      trim: true
    },
    cityState: {
      type: String,
      default: ""
    },
    doctorRegNo: {
      type: String,
      default: ""
    },
    doctorQualification: {
      type: String,
      default: ""
    },
    mobile: {
      type: String,
      default: ""
    },
    monthlyVolume: {
      type: String,
      default: "1,500 - 3,000 workers / month"
    },
    password: {
      type: String,
      required: [true, "Password is required"]
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    reviewedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("AccessRequest", AccessRequestSchema);
