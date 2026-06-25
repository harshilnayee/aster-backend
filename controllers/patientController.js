const mongoose = require("mongoose");
const Patient = require("../models/Patient");
const AuditLog = require("../models/AuditLog");
const { generatePatientId } = require("../utils/patientId");

/**
 * Get all patients with search/filter queries
 * GET /api/patients
 */
async function getPatients(req, res, next) {
  try {
    const { name, company, mobile, patientId, search, fromDate, toDate, formType } = req.query;
    const filter = {};

    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      filter.$or = [
        { name: searchRegex },
        { company: searchRegex },
        { patientId: searchRegex },
        { mobile: searchRegex }
      ];
    } else {
      if (name) filter.name = { $regex: name, $options: "i" };
      if (company && company !== "All") filter.company = { $regex: company, $options: "i" };
      if (mobile) filter.mobile = { $regex: mobile, $options: "i" };
      if (patientId) filter.patientId = { $regex: patientId, $options: "i" };
    }

    // Additional exact company filter if not using search regex
    if (company && company !== "All" && !filter.company) {
      filter.company = company;
    }

    // Date range filter
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) {
        const start = new Date(fromDate);
        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    // Form Type filter (ensures the form was completed/saved)
    if (formType && formType !== "All") {
      filter[`forms.${formType}.savedAt`] = { $exists: true, $ne: null };
    }

    const patients = await Patient.find(filter)
      .populate("createdBy", "name email role")
      .sort({ createdAt: -1 });

    return res.status(200).json(patients);
  } catch (error) {
    console.error("GetPatients error:", error);
    next(error);
  }
}

/**
 * Register a new patient
 * POST /api/patients
 */
async function createPatient(req, res, next) {
  try {
    const { name, age, gender, mobile, company, address, photo, signature, fatherName, occupation } = req.body;

    if (!name || !age || !gender) {
      return res.status(400).json({ message: "Name, age, and gender are required fields" });
    }

    // Auto-generate the unique Patient ID safely
    const patientIdString = await generatePatientId();

    const patient = new Patient({
      patientId: patientIdString,
      name,
      age,
      gender,
      mobile,
      company: company || "Aster Medcare",
      address,
      photo,
      signature,
      fatherName,
      occupation,
      createdBy: req.user._id
    });

    const savedPatient = await patient.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "patient_created",
      patientId: patientIdString,
      details: `Created patient record for ${name} (${gender}, age ${age})`
    });

    return res.status(201).json(savedPatient);
  } catch (error) {
    console.error("CreatePatient error:", error);
    next(error);
  }
}

/**
 * Get a single patient profile by ObjectId or patientId string
 * GET /api/patients/:id
 */
async function getPatient(req, res, next) {
  try {
    const { id } = req.params;

    // Search by ObjectId if valid, otherwise search by unique patientId string
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id }
      : { patientId: id };

    const patient = await Patient.findOne(query)
      .populate("createdBy", "name email role")
      .populate("forms.postMedical.savedBy", "name email role")
      .populate("forms.eyeExam.savedBy", "name email role")
      .populate("forms.form33.savedBy", "name email role")
      .populate("forms.healthRegister.savedBy", "name email role")
      .populate("forms.xrayReport.savedBy", "name email role")
      .populate("files.uploadedBy", "name email role");

    if (!patient) {
      return res.status(404).json({ message: "Patient record not found" });
    }

    return res.status(200).json(patient);
  } catch (error) {
    console.error("GetPatient error:", error);
    next(error);
  }
}

/**
 * Update patient demographic info
 * PUT /api/patients/:id
 */
async function updatePatient(req, res, next) {
  try {
    const { id } = req.params;
    const { name, age, gender, mobile, company, address, photo, signature, fatherName, occupation } = req.body;

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id }
      : { patientId: id };

    const patient = await Patient.findOne(query);
    if (!patient) {
      return res.status(404).json({ message: "Patient record not found" });
    }

    // Update allowable fields
    if (name !== undefined) patient.name = name;
    if (age !== undefined) patient.age = age;
    if (gender !== undefined) patient.gender = gender;
    if (mobile !== undefined) patient.mobile = mobile;
    if (company !== undefined) patient.company = company;
    if (address !== undefined) patient.address = address;
    if (photo !== undefined) patient.photo = photo;
    if (signature !== undefined) patient.signature = signature;
    if (fatherName !== undefined) patient.fatherName = fatherName;
    if (occupation !== undefined) patient.occupation = occupation;

    const updatedPatient = await patient.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "patient_updated",
      patientId: patient.patientId,
      details: `Updated patient details: ${Object.keys(req.body).join(", ")}`
    });

    return res.status(200).json(updatedPatient);
  } catch (error) {
    console.error("UpdatePatient error:", error);
    next(error);
  }
}

/**
 * Bulk create patient records from parsed Excel data
 * POST /api/patients/bulk
 */
async function createPatientsBulk(req, res, next) {
  try {
    const patientsData = req.body;

    if (!Array.isArray(patientsData) || patientsData.length === 0) {
      return res.status(400).json({ message: "Request body must be a non-empty array of patient objects" });
    }

    const createdPatients = [];

    // Process sequentially to prevent counter race conditions and generate clean IDs
    for (const patientObj of patientsData) {
      const { name, age, gender, mobile, company, address, fatherName, occupation } = patientObj;
      if (!name || !age || !gender) {
        continue; // Skip row if name, age, or gender is missing
      }

      const patientId = await generatePatientId();

      const patient = new Patient({
        patientId,
        name,
        age: Number(age),
        gender,
        mobile,
        company: company || "Aster Medcare",
        address,
        fatherName,
        occupation,
        createdBy: req.user._id
      });

      await patient.save();
      createdPatients.push(patient);
    }

    // Write audit log
    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "patient_created",
      details: `Imported ${createdPatients.length} patients via bulk Excel upload`
    });

    return res.status(201).json({
      message: `Successfully imported ${createdPatients.length} patient records.`,
      count: createdPatients.length
    });
  } catch (error) {
    console.error("CreatePatientsBulk error:", error);
    next(error);
  }
}

/**
 * Bulk create patients and return count and IDs
 * POST /api/patients/bulk (new implementation)
 */
async function bulkCreatePatients(req, res, next) {
  try {
    const { patients } = req.body;

    if (!patients || !Array.isArray(patients) || patients.length === 0) {
      return res.status(400).json({ message: "An array of patients is required in the 'patients' property." });
    }

    const createdPatients = [];
    const patientIds = [];

    for (const p of patients) {
      const { name, age, gender, mobile, company, address, fatherName, occupation } = p;
      if (!name || !age || !gender) {
        continue; // Skip invalid records
      }

      const patientId = await generatePatientId();
      patientIds.push(patientId);

      createdPatients.push({
        patientId,
        name,
        age: Number(age),
        gender,
        mobile,
        company: company || "Aster Medcare",
        address,
        fatherName,
        occupation,
        createdBy: req.user._id,
        forms: {}
      });
    }

    if (createdPatients.length === 0) {
      return res.status(400).json({ message: "No valid patient records to insert." });
    }

    const saved = await Patient.insertMany(createdPatients);

    // Create Audit Log
    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "patient_created",
      details: `Bulk imported ${saved.length} patients via new endpoint`
    });

    return res.status(201).json({
      count: saved.length,
      patientIds
    });
  } catch (error) {
    console.error("BulkCreatePatients error:", error);
    next(error);
  }
}

module.exports = {
  getPatients,
  createPatient,
  getPatient,
  updatePatient,
  createPatientsBulk,
  bulkCreatePatients
};
