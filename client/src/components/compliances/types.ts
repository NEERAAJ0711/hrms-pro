// Shared types, constants, and helpers for compliance components (extracted from compliances.tsx)

export const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const COMPLIANCE_TYPES = ["PF","ESI","Professional Tax","Labour Dept","Minimum Wage","ESIC Inspection","Custom"];
export const CURRENT_YEAR = new Date().getFullYear();
export const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
export const REPORT_STATES = ["Delhi","Uttar Pradesh","Haryana","Maharashtra","Karnataka","Rajasthan","Gujarat","Punjab","Madhya Pradesh","Telangana"];
export const REPORT_ACTS   = ["Contract Labour (R&A) Act","Minimum Wages Act","Payment of Wages Act","ESI Act","EPF & MP Act","Maternity Benefit Act","Payment of Bonus Act","Factories Act"];
export const REPORT_TYPES  = [
  "CLRA Full Package – Forms VIII + IX + XII + XIII",
  "Form VIII – Contractor Particulars",
  "Form IX – Workmen Register",
  "Form XII – Muster Roll",
  "Form XIII – Wages Register",
  "Form XIV – Wage Slip",
  "Form XV – Deductions Register",
  "Form XVI – Fines Register",
  "Form XVII – Advances Register",
  "Form XVIII – OT Register",
  "Form XIX – Annual Return",
];

export const WEEKLY_OFF_OPTIONS = [
  { value: "sunday",           label: "Sunday" },
  { value: "saturday_sunday",  label: "Saturday + Sunday" },
  { value: "second_fourth_sat",label: "2nd & 4th Saturday + Sunday" },
  { value: "custom",           label: "Custom" },
];
export const OT_TYPE_OPTIONS = [
  { value: "actual",  label: "Actual" },
  { value: "double",  label: "Double" },
  { value: "adjust",  label: "Adjust" },
];
export const PAYMENT_MODE_OPTIONS = [
  { value: "actual",      label: "Actual" },
  { value: "compliance",  label: "Compliances" },
  { value: "both",        label: "Both" },
];
export const DIFF_ADJ_OPTIONS = [
  { value: "carry_fwd",   label: "Carry Fwd" },
  { value: "fooding",     label: "Fooding" },
  { value: "advance",     label: "Advance" },
  { value: "incentive",   label: "Incentive" },
  { value: "reward_rec",  label: "Reward & Recognition" },
];
export const STATUTORY_OPTIONS = [
  { value: "actual",    label: "Actual" },
  { value: "exempted",  label: "Exempted" },
  { value: "ctc",       label: "CTC" },
  { value: "na",        label: "N/A" },
];
export const BONUS_OPTIONS = [
  { value: "na",       label: "N/A" },
  { value: "actual",   label: "Actual" },
  { value: "monthly",  label: "Monthly" },
  { value: "annual",   label: "Annual" },
];

// ─── Types ────────────────────────────────────────────────────────────────────
export interface EmployeeSetup {
  employeeId:      string;
  employeeCode:    string;
  employeeName:    string;
  empDepartment:   string;
  empDesignation:  string;
  pfApplicable:    boolean;
  esicApplicable:  boolean;
  lwfApplicable:   boolean;
  setupId:         string | null;
  department:      string;
  designation:     string;
  weeklyOff:       string;
  otType:          string;
  paymentMode:     string;
  diffAdjustments: string[];
  pfType:          string;
  esicType:        string;
  lwfType:         string;
  bonusType:       string;
  basicSalary:     string;
  grossSalary:     string;
  sameAsActual:    boolean;
  originalBasicSalary: number;
  originalGrossSalary: number;
  wageGradeId:     string;
  wageGradeName:   string;
  gradeMinWage:    number;
  allowances:      string;
}

export interface EmployeeRow {
  employeeId:   string;
  employeeCode: string;
  employeeName: string;
  department:   string;
  designation:  string;
  monDays:      number;
  payDays:      number;
  structureGross: number;
  rBasic:  number; rHra: number; rConv: number; rTotal: number;
  eBasic:  number; eHra: number; eConv: number; eOth: number; bonus: number; eTotal: number;
  pfType: string; esicType: string; lwfType: string; bonusType: string; diffAdj: string;
  otType: string;
  pf: number; vpf: number; esic: number; lwf: number; tds: number; pt: number; otherDed: number; loanAdv: number; dTotal: number; netPay: number;
  prevBal: number;
  paymentMode: string;
  originalAttendance:   number;
  originalOtHours:      string;
  originalBasicSalary:  number;
  originalGrossSalary:  number;
  originalNetSalary:    number;
  adjustment: {
    id: string;
    complianceType: string;
    partyName: string;
    adjustedAttendance:   number | null;
    adjustedOtHours:      string | null;
    adjustedBasicSalary:  number | null;
    adjustedGrossSalary:  number | null;
    adjustedNetSalary:    number | null;
    remarks:  string | null;
    status:   string;
  } | null;
}

export interface EditState {
  adjustedAttendance:   string;
  adjustedOtHours:      string;
  adjustedBasicSalary:  string;
  adjustedGrossSalary:  string;
  adjustedNetSalary:    string;
  remarks: string;
}

export interface WorkmenEmployee {
  serialNo: number; employeeCode: string; name: string; age: string; sex: string;
  fatherHusbandName: string; wagesPeriod: string; designation: string;
  permanentAddress: string; presentAddress: string; dateOfJoining: string; dateOfLeaving: string;
}
export interface WorkmenRegisterData {
  company: { name: string; address: string };
  client: {
    client_name: string | null; client_address: string | null;
    principal_employer_name: string | null; principal_employer_address: string | null;
    nature_of_work: string | null; location_of_work: string | null;
    project_start_date: string | null;
  } | null;
  employees: WorkmenEmployee[];
}

export type ClientInfo = {
  client_name?: string | null; client_address?: string | null;
  principal_employer_name?: string | null; principal_employer_address?: string | null;
  nature_of_work?: string | null; location_of_work?: string | null;
  project_name?: string | null; project_start_date?: string | null; project_end_date?: string | null;
} | null;

export interface FormVIIIData {
  company: { name: string; address: string };
  client: ClientInfo;
  month: string; year: string;
  totalWages: number; disbursedWages: number; maxWorkmen: number;
}

export interface MusterEmp {
  serialNo: number; name: string; fatherHusbandName: string;
  gender: string; designation: string;
  attendance: Record<number, string>;
  presentDays: number; woHd: number; netPayDays: number;
}
export interface MusterRollData {
  company: { name: string; address: string };
  client: ClientInfo;
  month: string; year: string; daysInMonth: number;
  employees: MusterEmp[];
}

export interface WagesEmp {
  serialNo: number; name: string; fatherHusbandName: string;
  designation: string; payDays: number; workingDays: number; monthlyRate: number;
  setupBasic: number; setupHra: number;
  basicSalary: number; hra: number; conveyance: number;
  medicalAllowance: number; specialAllowance: number;
  otherAllowances: number; bonus: number; totalEarnings: number;
  pf: number; esi: number; pt: number; lwf: number;
  tds: number; loanDeduction: number; otherDeductions: number;
  totalDeductions: number; netSalary: number;
}
export interface WagesRegisterData {
  company: { name: string; address: string };
  client: ClientInfo;
  month: string; year: string;
  employees: WagesEmp[];
}

export interface OTEmp {
  serialNo: number; name: string; designation: string;
  normalDays: number; otDays: number; otHours: number;
  normalWages: number; otWages: number;
}
export interface OTRegisterData {
  company: { name: string; address: string };
  client: ClientInfo;
  month: string; year: string;
  employees: OTEmp[];
}

export interface ClraPackageData {
  viii:  FormVIIIData;
  ix:    WorkmenRegisterData;
  xii:   MusterRollData;
  xiii:  WagesRegisterData;
  xviii: OTRegisterData;
}

export const fmt = (n: number | null | undefined) =>
  n != null ? `Rs.${n.toLocaleString("en-IN")}` : "-";

export const diff = (orig: number, adj: number | null | undefined) => {
  if (adj == null || adj === orig) return null;
  const d = adj - orig;
  return { d, up: d > 0 };
};

export interface ComplianceClient {
  id: string;
  company_id: string;
  project_name: string;
  client_name: string | null;
  client_address: string | null;
  principal_employer_name: string | null;
  principal_employer_address: string | null;
  nature_of_work: string | null;
  location_of_work: string | null;
  project_start_date: string | null;
  project_end_date: string | null;
  status: string;
  active_employees: number;
}

export interface ClientAssignment {
  id: string;
  employee_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  department: string | null;
  designation: string | null;
  present_address: string | null;
  assigned_date: string;
  deassigned_date: string | null;
  status: string;
}

export const DEFAULT_CLIENT_FORM = {
  projectName: "",
  clientName: "",
  clientAddress: "",
  principalEmployerName: "",
  principalEmployerAddress: "",
  natureOfWork: "",
  locationOfWork: "",
  projectStartDate: "",
};
