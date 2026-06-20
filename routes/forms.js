const express = require("express");
const router = express.Router();
const formController = require("../controllers/formController");
const { verifyToken, checkFormAccess } = require("../middleware/auth");

// POST /api/patients/:id/forms/:formType - Save a specific form (requires verifyToken and checkFormAccess)
router.post("/:id/forms/:formType", verifyToken, checkFormAccess("formType"), formController.saveForm);

// GET /api/patients/:id/forms/:formType - Get a specific form (requires verifyToken and checkFormAccess)
router.get("/:id/forms/:formType", verifyToken, checkFormAccess("formType"), formController.getForm);

module.exports = router;
