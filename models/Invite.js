const mongoose = require("mongoose");

/**
 * Invite — tracks superadmin-issued registration invites.
 *
 * Status is DERIVED (never stored) to avoid two sources of truth:
 *   used     → usedAt is set
 *   revoked  → revokedAt is set
 *   expired  → expiresAt < now  (and not used/revoked)
 *   pending  → everything else
 *
 * NO unique index on email — re-inviting an expired/revoked/used address
 * upserts the existing row (resets expiry, clears usedAt / revokedAt)
 * rather than inserting a duplicate.
 */
const InviteSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    },
    usedAt: {
      type: Date,
      default: null
    },
    revokedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

/** Helper: derive status string from an invite document. */
InviteSchema.methods.getStatus = function () {
  if (this.usedAt) return "used";
  if (this.revokedAt) return "revoked";
  if (this.expiresAt < new Date()) return "expired";
  return "pending";
};

module.exports = mongoose.model("Invite", InviteSchema);
