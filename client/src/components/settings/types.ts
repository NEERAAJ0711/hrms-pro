export interface SettingFormData {
  workingHoursStart: string;
  workingHoursEnd: string;
  weekStartDay: string;
  dateFormat: string;
  timeFormat: string;
  timezone: string;
  currency: string;
  fiscalYearStart: string;
  enableEmailNotifications: boolean;
  enableLeaveApprovalNotifications: boolean;
  enablePayrollNotifications: boolean;
  enableAttendanceReminders: boolean;
  passwordMinLength: string;
  sessionTimeout: string;
  twoFactorEnabled: boolean;
  ipRestriction: boolean;
}
