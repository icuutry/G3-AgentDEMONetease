const normalizeApplicationId = applicationId => String(applicationId ?? '');

export function createSupplementState() {
  let applicationId = null;
  let note;

  function clear() {
    applicationId = null;
    note = undefined;
  }

  return {
    reconcileRoute(page, nextApplicationId) {
      if (page !== 'supplement' || nextApplicationId === undefined || nextApplicationId === null) {
        const changed = applicationId !== null;
        clear();
        return changed;
      }

      const normalizedId = normalizeApplicationId(nextApplicationId);
      const changed = applicationId !== normalizedId;
      if (changed) {
        applicationId = normalizedId;
        note = undefined;
      }
      return changed;
    },

    capture(nextApplicationId, nextNote) {
      const normalizedId = normalizeApplicationId(nextApplicationId);
      if (!normalizedId) return false;
      applicationId = normalizedId;
      note = String(nextNote ?? '');
      return true;
    },

    noteFor(nextApplicationId, fallback = '') {
      const normalizedId = normalizeApplicationId(nextApplicationId);
      if (applicationId === normalizedId && note !== undefined) return note;
      return String(fallback ?? '');
    },

    markSubmissionSucceeded(submittedApplicationId) {
      if (applicationId === normalizeApplicationId(submittedApplicationId)) clear();
    },

    clear,

    get() {
      return applicationId === null
        ? null
        : { applicationId, note };
    }
  };
}
