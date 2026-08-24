const express = require("express");
const rateLimit = require("express-rate-limit");
const patientController = require("../controllers/patientController");
const publicFormDownload = require("../controllers/publicFormDownload");

const router = express.Router();

const publicCardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many card lookups. Please try again in a few minutes." }
});

const publicPdfLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many downloads. Please try again in a few minutes." }
});

router.get("/:id/forms-pack", publicPdfLimiter, publicFormDownload.downloadPublicFormPack);
router.get("/:id/forms/:formKey", publicPdfLimiter, publicFormDownload.downloadPublicForm);
router.get("/:id", publicCardLimiter, patientController.getPublicPatientCard);

module.exports = router;
