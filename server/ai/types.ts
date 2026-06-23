// Shared AI domain types. Kept dependency-free so any module can import them
// without risking a circular reference.

export interface KycStatus {
  aadhaarSubmitted: boolean;
  panSubmitted: boolean;
  bankDetailsSubmitted: boolean;
  cancelledChequeSubmitted: boolean;
  addressProofSubmitted: boolean;
  photographSubmitted: boolean;
  aadhaarVerified: boolean;
  panVerified: boolean;
  bankVerified: boolean;
  overallStatus: string;
}

export interface Attachment {
  fileName: string;
  filePath: string;
  docType: string;
  uploadedAt: string;
  extracted?: Record<string, string>;
}

export interface KycExtractionResult {
  available: boolean;
  reason?: string;
  fields?: Record<string, string>;
}

export interface EmployeeContext {
  // Employee static info
  employeeInfo?: {
    uan: string | null;
    esiNumber: string | null;
    pan: string | null;
    pfApplicable: boolean;
    esiApplicable: boolean;
    otApplicable: boolean;
    otRate: string | null;
    designation: string | null;
    department: string | null;
    dateOfJoining: string | null;
  };
  // Statutory / HRMS master profile (ESIC, EPFO & HRMS database fields)
  profile?: {
    gender: string | null;
    dateOfBirth: string | null;
    mobileNumber: string | null;
    officialEmail: string | null;
    fatherHusbandName: string | null;
    uan: string | null;
    esiNumber: string | null;
    pan: string | null;
    aadhaar: string | null;
    bankAccount: string | null;
    ifsc: string | null;
    presentAddress: string | null;
    permanentAddress: string | null;
    maritalStatus: string | null;
    motherName: string | null;
    bloodGroup: string | null;
    nomineeName: string | null;
    nomineeRelation: string | null;
    emergencyContactName: string | null;
    emergencyContactNumber: string | null;
  };
  // Last few payslips
  recentPayslips: Array<{
    month: string;
    year: number;
    netSalary: number;
    grossSalary: number;
    totalDeductions: number;
    basicSalary: number;
    hra: number;
    conveyance: number;
    medicalAllowance: number;
    specialAllowance: number;
    otherAllowances: number;
    customEarnings: Record<string, number>;
    pfEmployee: number;
    vpfAmount: number;
    esi: number;
    professionalTax: number;
    lwfEmployee: number;
    tds: number;
    otherDeductions: number;
    loanDeduction: number;
    customDeductions: Record<string, number>;
    bonus: number;
    otHours: string;
    otAmount: number;
    status: string;
    presentDays: string;
    workingDays: number;
    leaveDays: number;
    paidOn: string | null;
  }>;
  // Leave summary for the current year
  leaveSummary: Array<{
    leaveTypeName: string;
    leaveTypeCode: string;
    daysAllowed: number;
    daysUsed: number;
    daysPending: number;
    daysAvailable: number;
  }>;
  // Attendance for the current month
  currentMonthAttendance: {
    month: string;
    presentDays: number;
    absentDays: number;
    halfDays: number;
    leaveDays: number;
    totalRecords: number;
  };
  // Active salary structure (CTC breakdown)
  salaryStructure?: {
    basicSalary: number;
    hra: number;
    conveyance: number;
    medicalAllowance: number;
    specialAllowance: number;
    otherAllowances: number;
    customEarnings: Record<string, number>;
    grossSalary: number;
    pfEmployee: number;
    pfEmployer: number;
    vpfAmount: number;
    esi: number;
    professionalTax: number;
    lwfEmployee: number;
    tds: number;
    otherDeductions: number;
    customDeductions: Record<string, number>;
    netSalary: number;
    effectiveFrom: string;
  } | null;
  // Active loan/advance records
  loanAdvances: Array<{
    type: string;
    amount: number;
    purpose: string | null;
    status: string;
    requestDate: string;
    totalInstallments: number | null;
    installmentAmount: number | null;
    remainingBalance: number | null;
    deductionStartMonth: string | null;
  }>;
  // KRA/KPI assignments (current year)
  kraAssignments: Array<{
    title: string;
    reviewPeriod: string;
    periodYear: number;
    status: string;
    selfScore: number | null;
    managerScore: number | null;
    totalScore: number | null;
    feedback: string | null;
    kpis: Array<{
      kpiName: string;
      weightage: number;
      targetValue: number | null;
      actualValue: number | null;
      selfScore: number | null;
      managerScore: number | null;
      computedScore: number | null;
    }>;
  }>;
}
