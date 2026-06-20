const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  userRole: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      "patient_created",
      "patient_updated",
      "form_saved",
      "file_uploaded",
      "report_generated",
      "report_downloaded",
      "login",
      "logout"
    ]
  },
  patientId: {
    type: String // We can store the unique patient ID string (PT-YYYY-XXXX) for referencing
  },
  details: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("AuditLog", AuditLogSchema);
