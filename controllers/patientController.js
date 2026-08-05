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
 * Distinct company names for import / filter dropdowns
 * GET /api/patients/companies
 */
async function listCompanies(req, res, next) {
  try {
    const clinicScope =
      req.user?.role === "superadmin" || !req.user?.clinicId
        ? {}
        : { clinicId: req.user.clinicId };

    const raw = await Patient.distinct("company", {
      ...(req.tenantFilter || {}),
      ...clinicScope,
      company: { $nin: [null, ""] }
    });

    const companies = [
      ...new Set(
        (raw || [])
          .map((c) => String(c || "").trim())
          .filter(Boolean)
      )
    ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    return res.status(200).json({ companies });
  } catch (error) {
    console.error("ListCompanies error:", error);
    next(error);
  }
}

/**
 * Get all patients with search/filter queries
 * GET /api/patients
 */
async function getPatients(req, res, next) {
  try {
    const { name, company, mobile, patientId, search, fromDate, toDate, formType } = req.query;
    // Start filter with tenant scope so we never cross clinic boundaries
    const filter = {
      ...(req.tenantFilter || {}),
      ...(req.user?.role !== "superadmin" && req.user?.clinicId
        ? { clinicId: req.user.clinicId }
        : {})
    };

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

    const ALL_FORMS = [
      "preMedical", "postMedical", "eyeExam", "form33", "healthRegister", "xrayReport",
      "4-form-airport-bohw", "5-form-height-pass", "10-form-ophthal-form-6",
      "form09", "form10", "11-form-audiometry-front", "12-form-audiometry-back",
      "13-form-pft-front", "14-form-pft-back", "15-form-vaccination-front",
      "16-form-vaccination-back", "17-form-food-handler-certificate",
      "18-form-vaccine-ircs-forms-2", "19-form-ecg", "25-form-for-medical-fitness-certificate-format",
      "26-form-death-certificate", "35-form-airport-bohw-ht-front", "36-form-airport-bohw-ht-back",
      "form23"
    ];

    const projection = {
      patientId: 1,
      name: 1,
      age: 1,
      gender: 1,
      mobile: 1,
      employeeCode: 1,
      company: 1,
      whatsappRemindersSent: 1,
      updatedAt: 1,
      createdAt: 1,
      createdBy: 1,
      fatherName: 1,
      department: 1,
      address: 1,
      signature: { $cond: [{ $ifNull: ["$signature", false] }, "present", ""] },
      "forms.postMedical.data.fitStatus": 1
    };

    ALL_FORMS.forEach(f => {
      projection[`forms.${f}.savedAt`] = 1;
      projection[`forms.${f}.isDraft`] = 1;
    });

    const patients = await Patient.find(filter)
      .select(projection)
      .sort({ updatedAt: -1 })
      .lean();

    // Harden signature strip for older Mongo / projection edge cases
    for (const p of patients) {
      if (p.signature && p.signature !== "present" && String(p.signature).length > 20) {
        p.signature = "present";
      }
    }

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
    const { name, age, gender, mobile, employeeCode, company, address, companyAddress, photo, signature, fatherName, occupation,
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
      company: company || "",
      address,
      companyAddress,
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
      createdBy: req.user._id,
      clinicId: req.user.clinicId ?? null  // stamp the patient with the creating user's clinic
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

    const out = savedPatient.toObject();
    out.govIdNumber = decrypt(out.govIdNumber);
    // Never echo base64 signature / photo on create — list/detail can fetch when needed
    if (out.signature) out.signature = "present";
    delete out.photo;

    return res.status(201).json(out);
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
    // Always scope to the calling user's clinic (tenantFilter may be unset without middleware)
    const clinicScope =
      req.user?.role === "superadmin" || !req.user?.clinicId
        ? {}
        : { clinicId: req.user.clinicId };
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, ...(req.tenantFilter || {}), ...clinicScope }
      : { patientId: id, ...(req.tenantFilter || {}), ...clinicScope };

    // lean + minimal populate — avoid heavy savedBy joins on every form open
    const patient = await Patient.findOne(query)
      .select("-__v")
      .populate("createdBy", "name email role")
      .populate("files.uploadedBy", "name")
      .lean();

    if (!patient) {
      return res.status(404).json({ message: "Patient record not found" });
    }

    patient.govIdNumber = decrypt(patient.govIdNumber);

    // Employees only see forms they are allowed to access
    if (
      req.user?.role === "employee" &&
      patient.forms &&
      typeof patient.forms === "object"
    ) {
      const allowed = new Set(req.user.formAccess || []);
      const filtered = {};
      for (const [key, value] of Object.entries(patient.forms)) {
        if (allowed.has(key)) filtered[key] = value;
      }
      patient.forms = filtered;
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
    const { name, age, gender, mobile, employeeCode, company, address, companyAddress, photo, signature, fatherName, occupation,
      dob, surname, city, state, pincode, govIdType, govIdNumber, bloodGroup, email,
      department, employmentType, contractingAgency, diet, knownHabit } = req.body;

    const clinicScope =
      req.user?.role === "superadmin" || !req.user?.clinicId
        ? {}
        : { clinicId: req.user.clinicId };

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, ...(req.tenantFilter || {}), ...clinicScope }
      : { patientId: id, ...(req.tenantFilter || {}), ...clinicScope };

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
    if (companyAddress !== undefined) patient.companyAddress = companyAddress;
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

    // Return demographics only — avoid shipping full forms/signature payload after a simple edit
    const slim = updatedPatient.toObject();
    delete slim.forms;
    delete slim.files;
    if (slim.signature) slim.signature = "present";
    slim.govIdNumber = decrypt(slim.govIdNumber);
    return res.status(200).json(slim);
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
      const { name, age, gender, mobile, employeeCode, company, address, fatherName, surname, occupation, govIdType, govIdNumber,
        dob, city, state, pincode, department, dateOfJoining, companyAddress } = p;
      const patientId = patientIds[idx];

      createdPatients.push({
        patientId,
        name,
        age: Number(age),
        gender: gender || "Male",
        mobile,
        employeeCode,
        company: company || "",
        address,
        fatherName,
        surname,
        occupation,
        govIdType,
        govIdNumber: govIdNumber ? encrypt(govIdNumber) : undefined,
        dob,
        dateOfJoining,
        companyAddress,
        city,
        state,
        pincode,
        department,
        createdBy: req.user._id,
        clinicId: req.user.clinicId ?? null,  // stamp bulk-created patients
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

/**
 * Bulk update existing patients by employeeCode (Excel re-import / fill forgotten fields).
 * POST /api/patients/bulk-update
 * Body: { patients: [...], fillBlanksOnly?: boolean }
 */
async function bulkUpdatePatients(req, res, next) {
  try {
    const { patients, fillBlanksOnly = true } = req.body;

    if (!patients || !Array.isArray(patients) || patients.length === 0) {
      return res.status(400).json({ message: "An array of patients is required in the 'patients' property." });
    }

    const clinicScope =
      req.user?.role === "superadmin" || !req.user?.clinicId
        ? {}
        : { clinicId: req.user.clinicId };

    const UPDATABLE = [
      "name", "surname", "fatherName", "age", "dob", "gender", "mobile",
      "company", "address", "companyAddress", "city", "state", "pincode",
      "occupation", "department", "employeeCode", "govIdType", "govIdNumber"
    ];

    const normalizeCode = (v) => String(v || "").trim().toLowerCase();
    const normalizeName = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");

    const rows = patients.filter((p) => normalizeCode(p.employeeCode) || normalizeName(p.name));
    if (rows.length === 0) {
      return res.status(400).json({
        message: "Each update row needs an Employee Code (Emp ID) or Name so we can match existing patients."
      });
    }

    const codes = [...new Set(rows.map((p) => String(p.employeeCode || "").trim()).filter(Boolean))];
    const names = [...new Set(rows.map((p) => String(p.name || "").trim()).filter(Boolean))];

    const orClauses = [];
    if (codes.length) orClauses.push({ employeeCode: { $in: codes } });
    if (names.length) orClauses.push({ name: { $in: names } });

    const existing = await Patient.find({
      $or: orClauses,
      ...(req.tenantFilter || {}),
      ...clinicScope
    }).select("_id patientId employeeCode name mobile surname fatherName govIdType govIdNumber " + UPDATABLE.join(" "));

    const byCode = new Map();
    const byNameMobile = new Map();
    const byNameSurname = new Map();
    for (const doc of existing) {
      const codeKey = normalizeCode(doc.employeeCode);
      if (codeKey && !byCode.has(codeKey)) byCode.set(codeKey, doc);
      const n = normalizeName(doc.name);
      if (n) {
        const nm = `${n}||${normalizeCode(doc.mobile)}`;
        if (!byNameMobile.has(nm)) byNameMobile.set(nm, doc);
        const ns = `${n}||${normalizeName(doc.surname)}`;
        if (!byNameSurname.has(ns)) byNameSurname.set(ns, doc);
      }
    }

    const ops = [];
    let updated = 0;
    let unchanged = 0;
    let notFound = 0;
    const notFoundCodes = [];

    for (const row of rows) {
      const codeKey = normalizeCode(row.employeeCode);
      let doc = codeKey ? byCode.get(codeKey) : null;
      if (!doc && normalizeName(row.name)) {
        const n = normalizeName(row.name);
        if (row.mobile) doc = byNameMobile.get(`${n}||${normalizeCode(row.mobile)}`);
        if (!doc && row.surname) doc = byNameSurname.get(`${n}||${normalizeName(row.surname)}`);
      }
      if (!doc) {
        notFound += 1;
        if (notFoundCodes.length < 25) {
          notFoundCodes.push(String(row.employeeCode || row.name || "").trim());
        }
        continue;
      }

      const $set = {};
      for (const field of UPDATABLE) {
        if (!(field in row)) continue;
        let nextVal = row[field];
        if (nextVal === null || nextVal === undefined) continue;
        if (typeof nextVal === "string") nextVal = nextVal.trim();
        if (nextVal === "") continue;
        if (field === "age") {
          const n = Number(nextVal);
          if (!n || Number.isNaN(n) || n <= 0) continue;
          nextVal = n;
        }
        if (field === "govIdNumber") {
          nextVal = String(nextVal).replace(/\s+/g, "");
        }

        const current = doc[field];
        const currentEmpty =
          current === null ||
          current === undefined ||
          (typeof current === "string" && current.trim() === "");

        if (fillBlanksOnly && !currentEmpty) continue;
        if (field !== "govIdNumber" && String(current ?? "") === String(nextVal)) continue;

        if (field === "govIdNumber") {
          $set.govIdNumber = encrypt(nextVal);
          if (!doc.govIdType && !row.govIdType) $set.govIdType = "Aadhaar";
          if (row.govIdType) $set.govIdType = String(row.govIdType).trim();
          continue;
        }
        if (field === "govIdType" && $set.govIdNumber) {
          $set.govIdType = nextVal;
          continue;
        }
        $set[field] = nextVal;
      }

      if (Object.keys($set).length === 0) {
        unchanged += 1;
        continue;
      }

      ops.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set }
        }
      });
      updated += 1;
    }

    if (ops.length > 0) {
      await Patient.bulkWrite(ops, { ordered: false });
    }

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "patient_updated",
      details: `Bulk update: ${updated} updated, ${unchanged} unchanged, ${notFound} not found (fillBlanksOnly=${!!fillBlanksOnly})`
    });

    return res.status(200).json({
      message: `Updated ${updated} patient(s). ${unchanged} already had values. ${notFound} Emp ID(s) not found.`,
      updated,
      unchanged,
      notFound,
      notFoundCodes
    });
  } catch (error) {
    console.error("BulkUpdatePatients error:", error);
    next(error);
  }
}

async function cleanupPatientR2Files(patient) {
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

/**
 * Delete a single patient (Admin only) — also clears R2 assets.
 * DELETE /api/patients/:id
 */
async function deletePatient(req, res, next) {
  try {
    const { id } = req.params;
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { patientId: id }], ...req.tenantFilter }
      : { patientId: id, ...req.tenantFilter };

    const patient = await Patient.findOne(query);
    if (!patient) {
      return res.status(404).json({ message: "Patient record not found" });
    }

    await cleanupPatientR2Files(patient);
    await Patient.deleteOne({ _id: patient._id });

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "patient_deleted",
      patientId: patient.patientId,
      details: `Permanently deleted patient record for ${patient.name}`
    });

    return res.status(200).json({
      message: "Patient record deleted successfully"
    });
  } catch (error) {
    console.error("DeletePatient error:", error);
    next(error);
  }
}

async function bulkDeletePatients(req, res, next) {
  try {
    const { patientIds } = req.body;

    if (!patientIds || !Array.isArray(patientIds) || patientIds.length === 0) {
      return res.status(400).json({ message: "An array of patientIds is required." });
    }

    const clinicScope =
      req.user?.role === "superadmin" || !req.user?.clinicId
        ? {}
        : { clinicId: req.user.clinicId };
    const deleteFilter = { patientId: { $in: patientIds }, ...(req.tenantFilter || {}), ...clinicScope };

    const patients = await Patient.find(deleteFilter);
    for (const patient of patients) {
      await cleanupPatientR2Files(patient);
    }

    const result = await Patient.deleteMany(deleteFilter);

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

async function recordWhatsappReminder(req, res, next) {
  try {
    const { id } = req.params;
    const clinicScope =
      req.user?.role === "superadmin" || !req.user?.clinicId
        ? {}
        : { clinicId: req.user.clinicId };
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, ...(req.tenantFilter || {}), ...clinicScope }
      : { patientId: id, ...(req.tenantFilter || {}), ...clinicScope };

    const patient = await Patient.findOne(query);
    if (!patient) {
      return res.status(404).json({ message: "Patient record not found" });
    }

    patient.whatsappRemindersSent = (patient.whatsappRemindersSent || 0) + 1;
    await patient.save();

    // Log action
    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: "whatsapp_reminder_sent",
      patientId: patient.patientId,
      details: `WhatsApp reminder sent to patient ${patient.name} (Total: ${patient.whatsappRemindersSent})`
    });

    return res.status(200).json({
      message: "WhatsApp reminder recorded",
      whatsappRemindersSent: patient.whatsappRemindersSent
    });
  } catch (error) {
    console.error("RecordWhatsappReminder error:", error);
    next(error);
  }
}

module.exports = {
  getPatients,
  listCompanies,
  createPatient,
  getPatient,
  updatePatient,
  bulkCreatePatients,
  bulkUpdatePatients,
  bulkDeletePatients,
  deletePatient,
  recordWhatsappReminder
};
