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
        values: ["Male", "Female", "Other"],
        message: "Gender must be Male, Female, or Other"
      }
    },
    mobile: {
      type: String,
      trim: true
    },
    company: {
      type: String,
      trim: true,
      default: "Aster Medcare"
    },
    address: {
      type: String,
      trim: true
    },
    photo: {
      type: String // R2 public URL
    },
    fatherName: {
      type: String,
      trim: true
    },
    occupation: {
      type: String,
      trim: true
    },
    // Storage for 24 forms. Dynamic Mixed storage.
    forms: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    files: [PatientFileSchema],
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

module.exports = mongoose.model("Patient", PatientSchema);
