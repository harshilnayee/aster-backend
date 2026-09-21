const express = require("express");
const router = express.Router();
const { verifyToken, requireSuperAdmin, inviteLimiter } = require("../middleware/auth");
const { createInvite, listInvites, revokeInvite } = require("../controllers/inviteController");

// All routes require a valid JWT + superadmin role
router.use(verifyToken, requireSuperAdmin);

// POST   /api/invites         — create (or re-issue) an invite
router.post("/", inviteLimiter, createInvite);

// GET    /api/invites         — list all invites with derived status
router.get("/", listInvites);

// DELETE /api/invites/:id     — revoke a pending invite
router.delete("/:id", revokeInvite);

module.exports = router;
