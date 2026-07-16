const mongoose = require("mongoose");

const FormSchema = new mongoose.Schema({
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  savedAt: {
    type: Date
  },
  savedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, { _id: false });

const PatientFileSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ["X-Ray", "ECG", "Lab Report", "Other"],
    default: "Other"
  },
  fileUrl: {
    type: String,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

const PatientSchema = new mongoose.Schema(
  {
    patientId: {
      type: String,
      unique: true,
      required: [true, "Patient ID is required"]
    },
    name: {
      type: String,
      required: [true, "Patient name is required"],
      trim: true
    },
    age: {
      type: Number,
      required: [true, "Patient age is required"]
    },
    gender: {
      type: String,
      required: [true, "Patient gender is required"],
      enum: {
        values: ["Male", "Female", "Other", "Not Specified"],
        message: "Gender must be Male, Female, Other, or Not Specified"
      }
    },
    mobile: {
      type: String,
      trim: true
    },
    employeeCode: {
      type: String,
      trim: true
    },
    company: {
      type: String,
      trim: true,
      default: ""
    },
    address: {
      type: String,
      trim: true
    },
    photo: {
      type: String // R2 public URL
    },
    signature: {
      type: String // Base64 data URL
    },
    fatherName: {
      type: String,
      trim: true
    },
    occupation: {
      type: String,
      trim: true
    },
    dob: { type: Date },
    surname: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    govIdType: { type: String, trim: true },
    govIdNumber: { type: String, trim: true },
    bloodGroup: { type: String, trim: true },
    email: { type: String, trim: true },
    department: { type: String, trim: true },
    employmentType: { type: String, trim: true },
    contractingAgency: { type: String, trim: true },
    diet: { type: String, trim: true },
    knownHabit: { type: String, trim: true },
    // Storage for 24 forms. Dynamic Mixed storage.
    forms: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    files: [PatientFileSchema],
    whatsappRemindersSent: {
      type: Number,
      default: 0
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes to resolve read/write query latencies and avoid collection scans
PatientSchema.index({ patientId: 1 });
PatientSchema.index({ name: 1 });
PatientSchema.index({ company: 1 });
PatientSchema.index({ mobile: 1 });
PatientSchema.index({ updatedAt: -1 });
PatientSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Patient", PatientSchema);
