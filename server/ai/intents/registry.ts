// Phase 2 — intent → handler registry. Maps each detected intent string to the
// handler that fulfills it. Kept separate from the orchestrator so the wiring is
// easy to scan and extend.

import type { IntentHandler } from "./handlers/shared";
import * as self from "./handlers/employee-self";
import * as admin from "./handlers/hr-admin";
import * as actions from "./handlers/actions";
import * as analytics from "./handlers/analytics";
import * as workforce from "./handlers/workforce";

export const HANDLERS: Record<string, IntentHandler> = {
  // Employee self-service
  my_attendance: self.myAttendance,
  my_leave_balance: self.myLeaveBalance,
  apply_leave: self.applyLeave,
  cancel_leave: self.cancelLeave,
  my_shift: self.myShift,
  holiday_list: self.holidayList,
  my_payslip: self.myPayslip,
  my_pf: self.myPf,
  my_esic: self.myEsic,
  my_kyc: self.myKyc,
  update_phone: self.updatePhone,
  update_address: self.updateAddress,
  my_documents: self.myDocuments,
  my_kra: self.myKra,
  my_kpi: self.myKpi,
  my_appraisal: self.myAppraisal,
  my_reimbursement: self.myReimbursement,
  my_profile: self.myProfile,

  // HR / admin reads
  absentees_today: admin.absenteesToday,
  late_employees: admin.lateEmployees,
  on_leave_today: admin.onLeaveToday,
  attendance_summary: admin.attendanceSummary,
  missing_kyc: admin.missingKyc,
  expiring_documents: admin.expiringDocuments,
  probation_ending: admin.probationEnding,
  contract_expiry: admin.contractExpiry,
  birthdays_today: admin.birthdaysToday,
  anniversaries_today: admin.anniversariesToday,
  department_strength: admin.departmentStrength,
  gender_ratio: admin.genderRatio,
  location_wise: admin.locationWise,
  employee_count: admin.employeeCount,
  recruitment_status: admin.recruitmentStatus,
  recruitment_dashboard: admin.recruitmentDashboard,
  candidate_search: admin.candidateSearch,
  pending_interviews: admin.pendingInterviews,
  pending_approvals: admin.pendingApprovals,
  pending_onboarding: admin.pendingOnboarding,
  pending_resignations: admin.pendingResignations,
  pending_payroll: admin.pendingPayroll,
  quick_summary: admin.quickSummary,

  // Phase 4 — Attendance / Leave / Payroll AI (read-only intelligence)
  explain_my_attendance: analytics.explainMyAttendance,
  explain_my_leave: analytics.explainMyLeave,
  explain_my_payslip: analytics.explainMyPayslip,
  attendance_insights: analytics.attendanceInsights,
  leave_insights: analytics.leaveInsights,
  team_insights: analytics.teamInsights,
  payroll_insights: analytics.payrollInsights,
  executive_summary: analytics.executiveSummary,

  // Phase 6 — Workforce decision support (read-only, explainable)
  performance_intelligence: workforce.performanceIntelligence,
  promotion_readiness: workforce.promotionReadiness,
  increment_intelligence: workforce.incrementIntelligence,
  attrition_risk: workforce.attritionRisk,
  succession_planning: workforce.successionPlanning,
  learning_development: workforce.learningDevelopment,
  internal_mobility: workforce.internalMobility,
  org_health: workforce.orgHealth,
  leadership_report: workforce.leadershipReport,
  hr_copilot: workforce.hrCopilot,

  // Actions
  find_employee: actions.findEmployee,
  approve_leave: actions.approveLeave,
  reject_leave: actions.rejectLeave,

  // company_wise is intentionally not handled here yet (cross-company aggregate
  // is super-admin only and out of the current live-data scope). The orchestrator
  // treats a recognized-but-unimplemented intent deterministically — it replies
  // that the report isn't available yet rather than handing it to the LLM.
};
