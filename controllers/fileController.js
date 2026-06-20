const mongoose = require("mongoose");
const Patient = require("../models/Patient");
const AuditLog = require("../models/AuditLog");
const { uploadToR2, deleteFromR2 } = require("../utils/r2");

/**
 * Upload a file against a patient's profile
 * POST /api/patients/:id/files
 */
async function uploadFile(req, res, next) {
  try {
    const { id } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "No file provided for upload" });
    }

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id }
      : { patientId: id };

    const patient = await Patient.findOne(query);
    if (!patient) {
      return res.status(404).json({ message: "Patient record not found" });
    }

    // Format destination key: patients/PT-YYYY-XXXX/timestamp-filename
    // Sanitizing filename: remove special characters, spaces to underscores
    const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `patients/${patient.patientId}/${Date.now()}-${sanitizedFilename}`;

    // Upload to Cloudflare R2
    const fileUrl = await uploadToR2(file, key);

    // Save file metadata to patient record
    const fileData = {
      fileName: file.originalname,
      fileType: file.mimetype,
      category: req.body.category || "Other",
      fileUrl: fileUrl,
      uploadedBy: req.user._id
    };

    patient.files.push(fileData);
    await patient.save();

    // Log action
    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "file_uploaded",
      patientId: patient.patientId,
      details: `Uploaded file '${file.originalname}' (${file.mimetype})`
    });

    return res.status(200).json({
      message: "File uploaded successfully",
      file: patient.files[patient.files.length - 1]
    });
  } catch (error) {
    console.error("UploadFile controller error:", error);
    next(error);
  }
}

/**
 * Get all files for a specific patient
 * GET /api/patients/:id/files
 */
async function getFiles(req, res, next) {
  try {
    const { id } = req.params;

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id }
      : { patientId: id };

    const patient = await Patient.findOne(query)
      .populate("files.uploadedBy", "name email role");

    if (!patient) {
      return res.status(404).json({ message: "Patient record not found" });
    }

    return res.status(200).json({
      files: patient.files
    });
  } catch (error) {
    console.error("GetFiles controller error:", error);
    next(error);
  }
}

/**
 * Delete a specific file from patient record and R2 bucket
 * DELETE /api/patients/:id/files/:fileId
 */
async function deleteFile(req, res, next) {
  try {
    const { id, fileId } = req.params;

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id }
      : { patientId: id };

    const patient = await Patient.findOne(query);
    if (!patient) {
      return res.status(404).json({ message: "Patient record not found" });
    }

    // Find the file subdocument
    const file = patient.files.id(fileId);
    if (!file) {
      return res.status(404).json({ message: "File record not found under patient profile" });
    }

    // Extract R2 bucket Key from file URL
    // Public URL pattern: https://public-url/patients/PT-YYYY-XXXX/timestamp-filename
    // Or R2 default Endpoint: https://account-id.r2.cloudflarestorage.com/bucket/patients/PT-YYYY-XXXX/timestamp-filename
    const fileUrlObj = new URL(file.fileUrl);
    
    // Key is the pathname without the leading slash
    const key = decodeURIComponent(fileUrlObj.pathname.substring(1));

    // Delete from Cloudflare R2
    await deleteFromR2(key);

    // Remove from patient files subdocument array
    file.deleteOne();
    await patient.save();

    // Log action
    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "patient_updated",
      patientId: patient.patientId,
      details: `Deleted file '${file.fileName}'`
    });

    return res.status(200).json({
      message: "File deleted successfully"
    });
  } catch (error) {
    console.error("DeleteFile controller error:", error);
    next(error);
  }
}

module.exports = {
  uploadFile,
  getFiles,
  deleteFile
};
