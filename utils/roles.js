/** Clinic role hierarchy (highest first): superadmin → admin → doctor → employee */

const CLINIC_LEAD_ROLES = ["superadmin", "admin", "doctor"];

const ROLE_RANK = {
  superadmin: 4,
  admin: 3,
  doctor: 2,
  employee: 1
};

function isClinicLead(role) {
  return CLINIC_LEAD_ROLES.includes(role);
}

function canManageUsers(role) {
  return role === "superadmin" || role === "admin" || role === "doctor";
}

function canBulkDeletePatients(role) {
  return role === "superadmin" || role === "admin";
}

function canEditFormSequence(role) {
  return role === "superadmin" || role === "admin";
}

/** Roles the actor may assign when creating a user */
function assignableRoles(actorRole) {
  if (actorRole === "superadmin") {
    return ["employee", "doctor", "admin", "superadmin"];
  }
  if (actorRole === "admin") {
    return ["employee", "doctor", "admin"];
  }
  if (actorRole === "doctor") {
    return ["employee", "doctor"];
  }
  return [];
}

function canAssignRole(actorRole, targetRole) {
  return assignableRoles(actorRole).includes(targetRole);
}

/** Whether actor may change target user's status or form access */
function canModifyUser(actor, target) {
  if (!actor || !target) return false;
  if (actor._id.toString() === target._id.toString()) return false;

  if (target.role === "superadmin") {
    return actor.role === "superadmin";
  }
  if (target.role === "admin") {
    return actor.role === "superadmin";
  }
  if (target.role === "doctor") {
    return actor.role === "superadmin" || actor.role === "admin";
  }
  // employee
  return canManageUsers(actor.role);
}

function canDeactivateUser(actor, target) {
  if (!canModifyUser(actor, target)) return false;
  if (target.role === "superadmin" || target.role === "admin") {
    return actor.role === "superadmin";
  }
  return true;
}

module.exports = {
  CLINIC_LEAD_ROLES,
  ROLE_RANK,
  isClinicLead,
  canManageUsers,
  canBulkDeletePatients,
  canEditFormSequence,
  assignableRoles,
  canAssignRole,
  canModifyUser,
  canDeactivateUser
};
