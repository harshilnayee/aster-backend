const Invite = require("../models/Invite");

/**
 * POST /api/invites
 * Superadmin creates (or re-creates) an invite for an email address.
 *
 * Rules:
 *  - If a PENDING (not expired, not revoked, not used) invite already exists → reject.
 *  - If an invite exists but is expired/revoked/used → upsert: reset expiry, clear usedAt/revokedAt.
 *  - If no invite exists → create fresh.
 */
async function createInvite(req, res, next) {
  try {
    const rawEmail = req.body.email;
    if (!rawEmail) {
      return res.status(400).json({ message: "Email is required." });
    }

    const email = rawEmail.toLowerCase().trim();

    // Basic email format check
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }

    // Check if a user with this email already exists
    const User = require("../models/User");
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "A user with this email is already registered." });
    }

    const now = new Date();
    const existing = await Invite.findOne({ email });

    if (existing) {
      const status = existing.getStatus();

      // Block if a live pending invite exists
      if (status === "pending") {
        return res.status(409).json({
          message: `A pending invite for ${email} already exists. Revoke it first before re-inviting.`
        });
      }

      // Re-invite: reset the existing row (expired / revoked / used)
      existing.expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      existing.usedAt = null;
      existing.revokedAt = null;
      existing.invitedBy = req.user._id;
      await existing.save();

      return res.status(200).json({
        message: `Invite re-issued for ${email} (previous invite was ${status}).`,
        invite: _toPublic(existing)
      });
    }

    // Fresh invite
    const invite = await Invite.create({
      email,
      invitedBy: req.user._id,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    });

    return res.status(201).json({
      message: `Invite created for ${email}. Expires in 7 days.`,
      invite: _toPublic(invite)
    });
  } catch (err) {
    console.error("createInvite error:", err);
    next(err);
  }
}

/**
 * GET /api/invites
 * List all invites (most recent first), with derived status.
 */
async function listInvites(req, res, next) {
  try {
    const invites = await Invite.find().sort({ createdAt: -1 }).lean();
    const now = new Date();

    const result = invites.map((inv) => {
      let status = "pending";
      if (inv.usedAt) status = "used";
      else if (inv.revokedAt) status = "revoked";
      else if (inv.expiresAt < now) status = "expired";
      return { ...inv, status };
    });

    return res.status(200).json({ invites: result });
  } catch (err) {
    console.error("listInvites error:", err);
    next(err);
  }
}

/**
 * DELETE /api/invites/:id
 * Revoke a pending invite. No-op (with a clear message) if already used.
 * Does NOT deactivate the user account if invite was already used.
 */
async function revokeInvite(req, res, next) {
  try {
    const invite = await Invite.findById(req.params.id);
    if (!invite) {
      return res.status(404).json({ message: "Invite not found." });
    }

    const status = invite.getStatus();

    if (status === "used") {
      return res.status(400).json({
        message: "This invite has already been used (user is registered). To disable their account, use the User Manager instead."
      });
    }

    if (status === "revoked") {
      return res.status(400).json({ message: "This invite is already revoked." });
    }

    invite.revokedAt = new Date();
    await invite.save();

    return res.status(200).json({
      message: `Invite for ${invite.email} has been revoked.`,
      invite: _toPublic(invite)
    });
  } catch (err) {
    console.error("revokeInvite error:", err);
    next(err);
  }
}

/** Strip internal fields before sending to client. */
function _toPublic(invite) {
  const obj = invite.toObject ? invite.toObject() : { ...invite };
  const now = new Date();
  let status = "pending";
  if (obj.usedAt) status = "used";
  else if (obj.revokedAt) status = "revoked";
  else if (obj.expiresAt < now) status = "expired";
  return { ...obj, status };
}

module.exports = { createInvite, listInvites, revokeInvite };
