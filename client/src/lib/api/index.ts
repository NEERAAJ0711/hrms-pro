import type {
  Company,
  Employee,
  Payroll,
  SalaryStructure,
  Attendance,
  StatutorySettings,
  FnfSettlement,
  LeaveRequest,
  TimeOfficePolicy,
  Holiday,
  LoanAdvance,
  EarningHead,
  DeductionHead,
  ContractorMaster,
  WageGrade,
  Setting,
} from "@shared/schema";
import { fetchJson, fetchJsonOrEmpty, mutateJson, apiRequest } from "./client";

export { fetchJson, fetchJsonOrEmpty, mutateJson, apiRequest };

const qs = (params: Record<string, string | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
};

/**
 * Typed API client. Methods return the same data the existing inline fetches
 * returned and hit identical URLs, so TanStack query keys stay stable. Use the
 * `*OrEmpty` variants where the original inline code returned [] on failure, and
 * the plain variants where it threw.
 */
export const api = {
  companies: {
    list: () => fetchJson<Company[]>("/api/companies"),
    listOrEmpty: () => fetchJsonOrEmpty<Company[]>("/api/companies", []),
    employees: (companyId: string) => fetchJson<Employee[]>(`/api/companies/${companyId}/employees`),
    contractors: (companyId: string) => fetchJson<any[]>(`/api/companies/${companyId}/contractors`),
    contractorsOrEmpty: (companyId: string) => fetchJsonOrEmpty<any[]>(`/api/companies/${companyId}/contractors`, []),
    principalEmployers: (companyId: string) => fetchJson<any[]>(`/api/companies/${companyId}/principal-employers`),
    contractorEmployees: (companyId: string, contractorId: string) =>
      fetchJson<Employee[]>(`/api/companies/${companyId}/contractors/${contractorId}/employees`),
    contractorEmployeesOrEmpty: (companyId: string, contractorId: string) =>
      fetchJsonOrEmpty<Employee[]>(`/api/companies/${companyId}/contractors/${contractorId}/employees`, []),
  },
  employees: {
    list: () => fetchJson<Employee[]>("/api/employees"),
    listOrEmpty: () => fetchJsonOrEmpty<Employee[]>("/api/employees", []),
  },
  attendance: {
    list: (params: { date?: string; companyId?: string } = {}) =>
      fetchJson<Attendance[]>(`/api/attendance${qs(params)}`),
    listOrEmpty: (params: { date?: string; companyId?: string } = {}) =>
      fetchJsonOrEmpty<Attendance[]>(`/api/attendance${qs(params)}`, []),
  },
  salaryStructures: {
    list: () => fetchJson<SalaryStructure[]>("/api/salary-structures"),
  },
  payroll: {
    list: () => fetchJson<Payroll[]>("/api/payroll"),
    generate: (body: unknown) => mutateJson<any>("POST", "/api/payroll/generate", body),
    update: (id: string, body: unknown) => mutateJson<Payroll>("PATCH", `/api/payroll/${id}`, body),
    remove: (id: string) => apiRequest("DELETE", `/api/payroll/${id}`),
  },
  statutorySettings: {
    list: () => fetchJson<StatutorySettings[]>("/api/statutory-settings"),
    listOrEmpty: () => fetchJsonOrEmpty<StatutorySettings[]>("/api/statutory-settings", []),
    byCompany: (companyId?: string) =>
      fetchJson<StatutorySettings | StatutorySettings[]>(
        companyId ? `/api/statutory-settings?companyId=${companyId}` : "/api/statutory-settings",
      ),
  },
  fnfSettlements: {
    listOrEmpty: () => fetchJsonOrEmpty<FnfSettlement[]>("/api/fnf-settlements", []),
  },
  leaveRequests: {
    listOrEmpty: () => fetchJsonOrEmpty<LeaveRequest[]>("/api/leave-requests", []),
  },
  leaveTypes: {
    listOrEmpty: () => fetchJsonOrEmpty<{ id: string; name: string; code: string }[]>("/api/leave-types", []),
  },
  timeOfficePolicies: {
    listOrEmpty: () => fetchJsonOrEmpty<TimeOfficePolicy[]>("/api/time-office-policies", []),
  },
  holidays: {
    listOrEmpty: () => fetchJsonOrEmpty<Holiday[]>("/api/holidays", []),
  },
  earningHeads: {
    listOrEmpty: (companyId?: string) =>
      fetchJsonOrEmpty<EarningHead[]>(`/api/earning-heads${qs({ companyId })}`, []),
  },
  deductionHeads: {
    listOrEmpty: (companyId?: string) =>
      fetchJsonOrEmpty<DeductionHead[]>(`/api/deduction-heads${qs({ companyId })}`, []),
  },
  loanAdvances: {
    listOrEmpty: () => fetchJsonOrEmpty<LoanAdvance[]>("/api/loan-advances", []),
  },
  contractorMasters: {
    listOrEmpty: (companyId?: string) =>
      fetchJsonOrEmpty<ContractorMaster[]>(`/api/contractor-masters${qs({ companyId })}`, []),
  },
  wageGrades: {
    list: () => fetchJson<WageGrade[]>("/api/wage-grades"),
  },
  settings: {
    list: () => fetchJson<Setting[]>("/api/settings"),
    save: (body: unknown) => apiRequest("POST", "/api/settings", body),
    apiKeys: () => fetchJson<{ openai: { set: boolean; hint: string }; gemini: { set: boolean; hint: string } }>("/api/settings/api-keys"),
    saveApiKeys: (body: { openaiApiKey?: string; geminiApiKey?: string }) => apiRequest("POST", "/api/settings/api-keys", body),
  },
};

export type Api = typeof api;
