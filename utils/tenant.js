/**
 * Tenant scoping utility to enforce strict multi-tenant isolation.
 */

function clinicScopeFilter(req) {
  const tenantFilter = req?.tenantFilter || {};
  const queryClinicId = req?.query?.clinicId || req?.headers?.["x-clinic-id"];

  // 1. User belongs to a specific clinic: scope strictly to that clinic
  if (req?.user?.role !== "superadmin" && req?.user?.clinicId) {
    return { ...tenantFilter, clinicId: req.user.clinicId };
  }

  // 2. Superadmin explicitly requesting a specific clinic scope
  if (req?.user?.role === "superadmin") {
    if (queryClinicId && queryClinicId !== "all") {
      return { ...tenantFilter, clinicId: queryClinicId };
    }
    if (queryClinicId === "all") {
      return { ...tenantFilter };
    }
    // Superadmin default view: exclude trial sample patients so main patient table remains clean
    return {
      ...tenantFilter,
      isSample: { $ne: true },
      name: { $not: /\(Sample\)$/i }
    };
  }

  // 3. Legacy/Direct workspace user without clinicId: exclude sample patients from trial sign-ups
  return {
    ...tenantFilter,
    $or: [
      { clinicId: null },
      { clinicId: { $exists: false } }
    ],
    isSample: { $ne: true },
    name: { $not: /\(Sample\)$/i }
  };
}

module.exports = {
  clinicScopeFilter
};
