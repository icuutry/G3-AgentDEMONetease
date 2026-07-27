export const RULESET_VERSION = 'rules-v1.0.0';
export const STORAGE_KEY = 'carloan_demo_v2';

export const STATUS = {
  draft: { label: 'Draft', cls: 't-gray' },
  submitted: { label: 'Submitted', cls: 't-blue' },
  reviewing: { label: 'Under review', cls: 't-blue' },
  need_info: { label: 'Information required', cls: 't-warn' },
  approved: { label: 'Approved', cls: 't-ok' },
  rejected: { label: 'Rejected', cls: 't-bad' }
};

export const PRESETS = {
  low: {
    name: 'Amelia Tan', nric: 'S8••••21F', age: 38, residency: 'Singapore Citizen', phone: '9•••4412',
    empType: 'Full-time employee', employer: 'Northstar Logistics Pte. Ltd.', title: 'Operations Supervisor', empMonths: 20,
    incomeDeclared: 6000, incomeVerified: 6000, education: "Bachelor's degree", marital: 'Married',
    existingMonthly: 500, outstanding: 12000, latePayments: 0, otherLoans: 1,
    carModel: 'Toyota Corolla Altis 1.6', carPrice: 115000, omv: 17000, carAge: 1,
    downPayment: 43700, loanAmount: 71300, tenureYears: 5
  },
  medium: {
    name: 'Daniel Lim', nric: 'S9••••07D', age: 31, residency: 'Permanent Resident', phone: '8•••7730',
    empType: 'Full-time employee', employer: 'Harbourline Engineering Pte. Ltd.', title: 'Project Coordinator', empMonths: 10,
    incomeDeclared: 5000, incomeVerified: 4300, education: 'Diploma', marital: 'Single',
    existingMonthly: 1000, outstanding: 48000, latePayments: 1, otherLoans: 2,
    carModel: 'Honda Civic 1.5 Turbo', carPrice: 150000, omv: 25000, carAge: 4,
    downPayment: 60000, loanAmount: 90000, tenureYears: 7
  },
  high: {
    name: 'Marcus Wong', nric: 'S9••••55A', age: 27, residency: 'Work Pass Holder', phone: '9•••2038',
    empType: 'Self-employed / part-time', employer: 'Independent ride-hailing operator', title: 'Self-employed Driver', empMonths: 5,
    incomeDeclared: 4200, incomeVerified: 2900, education: 'Secondary school', marital: 'Single',
    existingMonthly: 1200, outstanding: 71000, latePayments: 3, otherLoans: 3,
    carModel: 'Mazda 3 1.5', carPrice: 130000, omv: 18000, carAge: 3,
    downPayment: 39000, loanAmount: 91000, tenureYears: 7
  }
};

export const INITIAL_CASES = [
  { preset: 'low', status: 'approved', decision: 'Approve', officerNote: 'Verified income matches the CPF record, debt is low, and the requested amount is acceptable.' },
  { preset: 'medium', status: 'reviewing', decision: null, officerNote: '' },
  { preset: 'high', status: 'rejected', decision: 'Reject', officerNote: 'The declared and verified incomes differ materially, with three late payments in the last 12 months.' },
  { preset: 'medium', status: 'need_info', decision: null, officerNote: '', suffix: ' (Second application)', needInfoReason: 'Please provide complete bank statements for the last three months so we can verify declared income.', duplicateOf: 1 },
  { preset: 'low', status: 'submitted', decision: null, officerNote: '' }
];

export const STEP_NAMES = ['Personal details', 'Employment & income', 'Debt & credit', 'Vehicle & loan', 'Review & submit'];
