const mongoose = require("mongoose");
const Patient = require("../models/Patient");
const AuditLog = require("../models/AuditLog");
const { generatePatientId, generatePatientIdsBatch } = require("../utils/patientId");
const { encrypt, decrypt } = require("../utils/encryption");
const { deleteFromR2 } = require("../utils/r2");

function escapeRegex(str) {
  if (!str) return "";
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Get all patients with search/filter queries
 * GET /api/patients
 */
async function getPatients(req, res, next) {
  try {
    const { name, company, mobile, patientId, search, fromDate, toDate, formType } = req.query;
    const filter = {};

    if (search) {
      const searchRegex = { $regex: escapeRegex(search), $options: "i" };
      filter.$or = [
        { name: searchRegex },
        { company: searchRegex },
        { patientId: searchRegex },
        { mobile: searchRegex }
      ];
    } else {
      if (name) filter.name = { $regex: escapeRegex(name), $options: "i" };
      if (company && company !== "All") filter.company = { $regex: escapeRegex(company), $options: "i" };
      if (mobile) filter.mobile = { $regex: escapeRegex(mobile), $options: "i" };
      if (patientId) filter.patientId = { $regex: escapeRegex(patientId), $options: "i" };
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
      .select("-govIdNumber")
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
    const { name, age, gender, mobile, employeeCode, company, address, photo, signature, fatherName, occupation,
      dob, surname, city, state, pincode, govIdType, govIdNumber, bloodGroup, email,
      department, employmentType, contractingAgency, diet, knownHabit } = req.body;

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
      employeeCode,
      company: company || "Aster Medcare",
      address,
      photo,
      signature,
      fatherName,
      occupation,
      dob,
      surname,
      city,
      state,
      pincode,
      govIdType,
      govIdNumber: encrypt(govIdNumber),
      bloodGroup,
      email,
      department,
      employmentType,
      contractingAgency,
      diet,
      knownHabit,
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

    const patientObj = patient.toObject();
    patientObj.govIdNumber = decrypt(patientObj.govIdNumber);
    return res.status(200).json(patientObj);
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
    const { name, age, gender, mobile, employeeCode, company, address, photo, signature, fatherName, occupation,
      dob, surname, city, state, pincode, govIdType, govIdNumber, bloodGroup, email,
      department, employmentType, contractingAgency, diet, knownHabit } = req.body;

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
    if (employeeCode !== undefined) patient.employeeCode = employeeCode;
    if (company !== undefined) patient.company = company;
    if (address !== undefined) patient.address = address;
    if (photo !== undefined) patient.photo = photo;
    if (signature !== undefined) patient.signature = signature;
    if (fatherName !== undefined) patient.fatherName = fatherName;
    if (occupation !== undefined) patient.occupation = occupation;
    if (dob !== undefined) patient.dob = dob;
    if (surname !== undefined) patient.surname = surname;
    if (city !== undefined) patient.city = city;
    if (state !== undefined) patient.state = state;
    if (pincode !== undefined) patient.pincode = pincode;
    if (govIdType !== undefined) patient.govIdType = govIdType;
    if (govIdNumber !== undefined) patient.govIdNumber = encrypt(govIdNumber);
    if (bloodGroup !== undefined) patient.bloodGroup = bloodGroup;
    if (email !== undefined) patient.email = email;
    if (department !== undefined) patient.department = department;
    if (employmentType !== undefined) patient.employmentType = employmentType;
    if (contractingAgency !== undefined) patient.contractingAgency = contractingAgency;
    if (diet !== undefined) patient.diet = diet;
    if (knownHabit !== undefined) patient.knownHabit = knownHabit;

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
 * Bulk create patients and return count and IDs
 * POST /api/patients/bulk (new implementation)
 */
async function bulkCreatePatients(req, res, next) {
  try {
    const { patients } = req.body;

    if (!patients || !Array.isArray(patients) || patients.length === 0) {
      return res.status(400).json({ message: "An array of patients is required in the 'patients' property." });
    }

    const validRecords = patients.filter(p => p.name && p.age);
    if (validRecords.length === 0) {
      return res.status(400).json({ message: "No valid patient records to insert." });
    }

    // Atomically generate all required patient IDs in a single batch query
    const patientIds = await generatePatientIdsBatch(validRecords.length);
    const createdPatients = [];

    validRecords.forEach((p, idx) => {
      const { name, age, gender, mobile, employeeCode, company, address, fatherName, occupation, govIdType, govIdNumber,
        dob, city, state, pincode, department } = p;
      const patientId = patientIds[idx];

      createdPatients.push({
        patientId,
        name,
        age: Number(age),
        gender: gender || "Not Specified",
        mobile,
        employeeCode,
        company: company || "Aster Medcare",
        address,
        fatherName,
        occupation,
        govIdType,
        govIdNumber: govIdNumber ? encrypt(employeeCode ? undefined : govIdNumber) : undefined,
        dob,
        city,
        state,
        pincode,
        department,
        createdBy: req.user._id,
        forms: {}
      });
    });

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

async function bulkDeletePatients(req, res, next) {
  try {
    const { patientIds } = req.body;

    if (!patientIds || !Array.isArray(patientIds) || patientIds.length === 0) {
      return res.status(400).json({ message: "An array of patientIds is required." });
    }

    // Fetch the full patient documents first to clean up their files in Cloudflare R2
    const patients = await Patient.find({ patientId: { $in: patientIds } });

    for (const patient of patients) {
      const urlsToDelete = [];
      if (patient.photo) urlsToDelete.push(patient.photo);
      if (patient.signature) urlsToDelete.push(patient.signature);
      if (patient.files && Array.isArray(patient.files)) {
        for (const file of patient.files) {
          if (file.fileUrl) urlsToDelete.push(file.fileUrl);
        }
      }

      for (const fileUrl of urlsToDelete) {
        if (typeof fileUrl !== "string" || fileUrl.startsWith("data:")) continue;
        try {
          const urlObj = new URL(fileUrl);
          const key = decodeURIComponent(urlObj.pathname.substring(1));
          if (key) {
            await deleteFromR2(key);
          }
        } catch (err) {
          console.error(`Failed to delete R2 file ${fileUrl}:`, err);
        }
      }
    }

    const result = await Patient.deleteMany({ patientId: { $in: patientIds } });

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "patient_deleted",
      details: `Bulk deleted ${result.deletedCount} patients from database and cleared their associated R2 files`
    });

    return res.status(200).json({
      message: `Successfully deleted ${result.deletedCount} patients.`,
      count: result.deletedCount
    });
  } catch (error) {
    console.error("BulkDeletePatients error:", error);
    next(error);
  }
}

module.exports = {
  getPatients,
  createPatient,
  getPatient,
  updatePatient,
  bulkCreatePatients,
  bulkDeletePatients
};
