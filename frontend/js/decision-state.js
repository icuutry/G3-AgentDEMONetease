export const DECISION_ACTIONS = Object.freeze([
  'Approve',
  'Reject',
  'Request Info'
]);

const validActions = new Set(DECISION_ACTIONS);
const applicationId = value => String(value ?? '');

export function createDecisionState() {
  let selection = null;

  return {
    clear() {
      selection = null;
    },

    get() {
      return selection ? { ...selection } : null;
    },

    select(id, action) {
      const normalizedId = applicationId(id);
      if (!normalizedId || !validActions.has(action)) {
        selection = null;
        return false;
      }
      selection = { applicationId: normalizedId, action };
      return true;
    },

    reconcileRoute(page, id) {
      const normalizedId = applicationId(id);
      if (
        page !== 'case'
        || !selection
        || selection.applicationId !== normalizedId
      ) {
        selection = null;
      }
      return this.get();
    },

    validate({ applicationId: id, note, eligible }) {
      const normalizedId = applicationId(id);
      if (!selection) {
        return { valid: false, reason: 'missing_selection', action: null };
      }
      if (selection.applicationId !== normalizedId) {
        return { valid: false, reason: 'application_mismatch', action: null };
      }
      if (!validActions.has(selection.action)) {
        return { valid: false, reason: 'unknown_action', action: null };
      }
      if (!eligible) {
        return { valid: false, reason: 'ineligible_status', action: null };
      }
      if (!String(note ?? '').trim()) {
        return { valid: false, reason: 'blank_rationale', action: null };
      }
      return { valid: true, reason: null, action: selection.action };
    },

    markSubmissionSucceeded(id) {
      if (selection?.applicationId === applicationId(id)) {
        selection = null;
      }
    }
  };
}
