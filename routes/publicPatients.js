const express = require("express");
const rateLimit = require("express-rate-limit");
const patientController = require("../controllers/patientController");

const router = express.Router();

const publicCardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many card lookups. Please try again in a few minutes." }
});

router.get("/:id", publicCardLimiter, patientController.getPublicPatientCard);

module.exports = router;
