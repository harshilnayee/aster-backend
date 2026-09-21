const express = require("express");
const router = express.Router();
const { verifyToken, requireSuperAdmin, registerLimiter } = require("../middleware/auth");
const { submitRequest, listRequests, approveRequest, rejectRequest } = require("../controllers/accessRequestController");

// Public route: submit an access request
router.post("/", registerLimiter, submitRequest);

// Superadmin-only management routes
router.get("/", verifyToken, requireSuperAdmin, listRequests);
router.post("/:id/approve", verifyToken, requireSuperAdmin, approveRequest);
router.post("/:id/reject", verifyToken, requireSuperAdmin, rejectRequest);

module.exports = router;
