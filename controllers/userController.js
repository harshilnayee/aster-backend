const User = require("../models/User");

// All 24 form keys placeholder list
const ALL_24_FORMS = [
  "preMedical", "postMedical", "eyeExam", "form33", "healthRegister", "xrayReport",
  "4-form-airport-bohw", "5-form-height-pass", "10-form-ophthal-form-6",
  "form09", "form10",
  "11-form-audiometry-front", "form12", "form13", "form14", "15-form-vaccination-front",
  "16-form-vaccination-back", "17-form-food-handler-certificate", "18-form-vaccine-ircs-forms-2", "25-form-for-medical-fitness-certificate-format", "26-form-death-certificate",
  "35-form-airport-bohw-ht-front", "36-form-airport-bohw-ht-back", "form23"
];

/**
 * List all employee accounts
 * GET /api/users
 */
async function getUsers(req, res, next) {
  try {
    const users = await User.find({}).sort({ createdAt: -1 });
    return res.status(200).json(users);
  } catch (error) {
    console.error("GetUsers error:", error);
    next(error);
  }
}

/**
 * Create a new employee/user account
 * POST /api/users
 */
async function createUser(req, res, next) {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Name, email, password, and role are required." });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: "User with this email already exists." });
    }

    // Set default formAccess based on role:
    // admin and doctor get full access, employee gets empty by default as per spec
    const formAccess = (role === "admin" || role === "doctor") ? ALL_24_FORMS : [];

    const user = new User({
      name,
      email: email.toLowerCase(),
      password, // Will be encrypted by Mongoose schema hook
      role,
      formAccess,
      isActive: true
    });

    await user.save();

    // Sanitize response
    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(201).json({
      message: "User account created successfully",
      user: userResponse
    });
  } catch (error) {
    console.error("CreateUser error:", error);
    next(error);
  }
}

/**
 * Update employee active status and form access permissions
 * PUT /api/users/:id/access
 */
async function updateUserAccess(req, res, next) {
  try {
    const { id } = req.params;
    const { formAccess, isActive } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Cannot update own access or self-deactivate for safety
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "Administrators cannot modify their own privileges or status." });
    }

    // Cannot deactivate an admin user
    if (isActive === false && user.role === "admin") {
      return res.status(400).json({ message: "Administrators/Super users cannot be deactivated." });
    }

    if (formAccess !== undefined) {
      if (!Array.isArray(formAccess)) {
        return res.status(400).json({ message: "Form access permissions must be an array of strings." });
      }
      user.formAccess = formAccess;
    }

    if (isActive !== undefined) {
      user.isActive = isActive;
    }

    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(200).json({
      message: "User access rights updated successfully",
      user: userResponse
    });
  } catch (error) {
    console.error("UpdateUserAccess error:", error);
    next(error);
  }
}

module.exports = {
  getUsers,
  createUser,
  updateUserAccess
};
