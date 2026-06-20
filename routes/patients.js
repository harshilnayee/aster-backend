const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const patientController = require("../controllers/patientController");
const { verifyToken, requireRole } = require("../middleware/auth");
const Patient = require("../models/Patient");
const AuditLog = require("../models/AuditLog");

// GET /api/patients - Get patient list (Admin, Doctor, Employee)
router.get("/", verifyToken, patientController.getPatients);

// POST /api/patients - Create a new patient (Admin, Doctor, Employee)
router.post("/", verifyToken, patientController.createPatient);

// POST /api/patients/bulk - Bulk create patients from Excel (Admin, Employee)
router.post("/bulk", verifyToken, patientController.bulkCreatePatients);

// GET /api/patients/:id - Get patient details by ID (Admin, Doctor, Employee)
router.get("/:id", verifyToken, patientController.getPatient);

// PUT /api/patients/:id - Update patient details (Admin, Doctor, Employee)
router.put("/:id", verifyToken, patientController.updatePatient);

// DELETE /api/patients/:id - Delete patient record (Admin only)
router.delete("/:id", verifyToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { id } = req.params;

    const patient = await Patient.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
        { patientId: id }
      ].filter(Boolean)
    });

    if (!patient) {
      return res.status(404).json({ message: "Patient record not found" });
    }

    await Patient.deleteOne({ _id: patient._id });

    // Log action
    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "patient_updated",
      patientId: patient.patientId,
      details: `Permanently deleted patient record for ${patient.name}`
    });

    return res.status(200).json({
      message: "Patient record deleted successfully"
    });
  } catch (error) {
    console.error("DeletePatient route error:", error);
    next(error);
  }
});

module.exports = router;
