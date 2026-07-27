import * as store from './store.js';
import { evaluate } from './risk-engine.js';

const copy = value => value == null ? value : structuredClone(value);

export async function listApplications() { return copy(store.listApplications()); }
export async function getApplication(applicationId) { return copy(store.findApplication(applicationId)); }
export async function createApplication(payload) { return copy(store.createApplication(payload)); }
export async function updateApplication(applicationId, payload) { return copy(store.updateApplication(applicationId, payload)); }
export async function submitApplication(applicationId) { return copy(store.submitApplication(applicationId)); }
export async function getRiskAssessment(applicationId) {
  const app = store.findApplication(applicationId);
  return app ? copy(evaluate(app, store.listApplications())) : null;
}
export async function approveApplication(applicationId, payload) { return copy(store.decideApplication(applicationId, 'Approve', payload)); }
export async function rejectApplication(applicationId, payload) { return copy(store.decideApplication(applicationId, 'Reject', payload)); }
export async function requestSupplement(applicationId, payload) { return copy(store.decideApplication(applicationId, 'Request Info', payload)); }
export async function submitSupplement(applicationId, payload) { return copy(store.submitSupplement(applicationId, payload)); }
export async function getAuditLogs(applicationId) { return copy(store.getAuditLogs(applicationId)); }
