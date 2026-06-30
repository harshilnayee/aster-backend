const express = require("express");
const router = express.Router();
const pdfController = require("../controllers/pdfController");
const { verifyToken } = require("../middleware/auth");

// GET /api/forms - Get list of all forms in registry
router.get("/", verifyToken, pdfController.getForms);

// GET /api/forms/:formId/coordinates - Get coordinates keys/fields for a form
router.get("/:formId/coordinates", verifyToken, pdfController.getFormCoordinates);

// GET /api/forms/doctor-signature - Retrieve doctor signature image
router.get("/doctor-signature", pdfController.getDoctorSignature);

// POST /api/forms/fill/:formId - Fill a PDF form template by registered ID
router.post("/fill/:formId", verifyToken, pdfController.fillPdfForm);

module.exports = router;
