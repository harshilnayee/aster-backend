const express = require("express");
const router = express.Router();
const pdfController = require("../controllers/pdfController");
const { verifyToken } = require("../middleware/auth");

// GET /api/forms - Get list of all forms in registry
router.get("/", verifyToken, pdfController.getForms);
router.get("/doctor-signature", verifyToken, pdfController.getDoctorSignature);
router.get("/doctor-stamp", verifyToken, pdfController.getDoctorStamp);
router.get("/template/:formId", verifyToken, pdfController.getFormTemplate);
router.get("/layout/:formId", verifyToken, pdfController.getFormLayout);
router.post("/bulk-values", verifyToken, pdfController.bulkExportValues);
router.post("/bulk-export", verifyToken, pdfController.bulkExportReports);
router.get("/:formId/coordinates", verifyToken, pdfController.getFormCoordinates);
router.post("/fill/:formId", verifyToken, pdfController.fillPdfForm);

module.exports = router;
