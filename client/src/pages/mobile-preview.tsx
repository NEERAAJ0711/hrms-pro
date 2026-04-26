import { useState, useEffect, useCallback, useRef } from "react";

// ── Flutter AppTheme colors ────────────────────────────────────────────────────
const PRIMARY   = "#1A56DB";
const PRIMARY_D = "#1342B5";
const ACCENT    = "#0694A2";
const ERROR     = "#E02424";
const WARN      = "#FACA15";
const TEXT1     = "#111928";
const TEXT2     = "#6B7280";
const BG        = "#F9FAFB";

// ── Types ─────────────────────────────────────────────────────────────────────
interface User { id: string; firstName: string; lastName: string; role: string; companyId?: string; hasCompany?: boolean; }
interface DashData { employee?: any; todayAttendance?: any; pendingLeaves?: number; jobApplications?: number; monthStats?: any; }
interface AttRec  { id: string; date: string; clockIn?: string; clockOut?: string; status: string; workHours?: string; }
interface LeaveType { id: string; name: string; code: string; daysPerYear?: number; daysAllowed?: number; annualEntitlement?: number; }
interface LeaveReq { id: string; startDate: string; endDate: string; status: string; reason?: string; days?: number; leaveType?: string; }
interface Payslip { id: string; month: string; year: number; netPay?: number; netSalary?: number; grossSalary?: number; grossEarnings?: number; basicSalary?: number; hra?: number; da?: number; conveyance?: number; medicalAllowance?: number; specialAllowance?: number; otherEarnings?: number; monthlyBonus?: number; pfEmployee?: number; esicEmployee?: number; professionalTax?: number; tds?: number; lwf?: number; otherDeductions?: number; totalDeductions?: number; employeeName?: string; employeeCode?: string; department?: string; designation?: string; companyName?: string; }
interface Notif { id: string; title: string; message: string; type: string; isRead: boolean; createdAt: string; }

// ── API helper ────────────────────────────────────────────────────────────────
async function mapi<T = any>(path: string, opts?: RequestInit, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { ...opts, headers: { ...headers, ...((opts?.headers ?? {}) as Record<string, string>) } });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || err.message || "Request failed"); }
  return res.json();
}

function fmt(v: any) {
  if (v == null) return "0";
  const n = typeof v === "number" ? v : Number(v) || 0;
  return "₹" + n.toLocaleString("en-IN");
}

// ── Phone frame ───────────────────────────────────────────────────────────────
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Roboto', system-ui, sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.07);opacity:.92}} input:focus{border-color:${PRIMARY}!important;}`}</style>
      <div style={{ position: "relative", width: 390, height: 844, background: "#fff", borderRadius: 50, boxShadow: "0 0 0 12px #222, 0 0 0 14px #444, 0 30px 80px rgba(0,0,0,0.6)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Notch */}
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 120, height: 30, background: "#222", borderRadius: "0 0 20px 20px", zIndex: 10 }} />
        {children}
      </div>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ full }: { full?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: full ? 80 : 40 }}>
      <div style={{ width: 32, height: 32, border: `3px solid #E5E7EB`, borderTop: `3px solid ${PRIMARY}`, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
function Card({ children, style, onClick }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,.12), 0 1px 2px rgba(0,0,0,.08)", overflow: "hidden", cursor: onClick ? "pointer" : undefined, ...style }}>
      {children}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    present:  ["#DCFCE7", "#16A34A"], absent:   ["#FEE2E2", "#DC2626"],
    late:     ["#FEF3C7", "#D97706"], approved: ["#DCFCE7", "#16A34A"],
    pending:  ["rgba(250,202,21,.15)", "#92400E"], rejected: ["#FEE2E2", "#DC2626"],
    weekend:  ["#EDE9FE", "#7C3AED"], holiday:  ["#E0F2FE", "#0369A1"],
    paid:     ["#DCFCE7", "#16A34A"], draft:    ["#F1F5F9", TEXT2],
    "half-day":["#FEF3C7","#D97706"],
  };
  const [bg, fg] = map[status?.toLowerCase()] ?? ["#F3F4F6", TEXT2];
  return <span style={{ background: bg, color: fg, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: .3 }}>{status}</span>;
}

// ── Role badge ────────────────────────────────────────────────────────────────
function roleName(r: string) {
  const m: Record<string,string> = { super_admin:"SUPER ADMIN", company_admin:"ADMIN", hr_admin:"HR", manager:"MANAGER", employee:"EMPLOYEE" };
  return m[r] ?? r.toUpperCase();
}

// ── Icon SVGs (inline) ────────────────────────────────────────────────────────
const Ic = {
  dashboard: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" fill="currentColor"/><rect x="14" y="3" width="7" height="7" rx="1" fill="currentColor"/><rect x="3" y="14" width="7" height="7" rx="1" fill="currentColor"/><rect x="14" y="14" width="7" height="7" rx="1" fill="currentColor"/></svg>,
  attendance: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8"/><path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  leave: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M8 2v4M16 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  more: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>,
  bell: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 1 7 7v4l2 3H3l2-3V9a7 7 0 0 1 7-7z" stroke="white" strokeWidth="1.8"/><path d="M10 20a2 2 0 0 0 4 0" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  logout: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M17 16l4-4-4-4M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  back: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  person: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="7" r="4" stroke={PRIMARY} strokeWidth="1.8"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" stroke={PRIMARY} strokeWidth="1.8" strokeLinecap="round"/></svg>,
  lock: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" stroke={PRIMARY} strokeWidth="1.8"/><path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={PRIMARY} strokeWidth="1.8" strokeLinecap="round"/></svg>,
  eye: <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="9" ry="5" stroke={TEXT2} strokeWidth="1.8"/><circle cx="12" cy="12" r="2.5" fill={TEXT2}/></svg>,
  eyeOff: <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M3 3l18 18M10.5 10.5A3 3 0 0 0 15 15" stroke={TEXT2} strokeWidth="1.8" strokeLinecap="round"/><path d="M6.4 6.4C4.3 7.8 2.7 9.8 2 12c1.6 4.4 6 7.5 10 7.5 1.8 0 3.5-.5 5-1.4M9 4.8C10 4.3 11 4 12 4c4 0 8.4 3.1 10 8a14 14 0 0 1-1.2 2.8" stroke={TEXT2} strokeWidth="1.8" strokeLinecap="round"/></svg>,
  settings: <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke="rgba(255,255,255,.5)" strokeWidth="1.8"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="rgba(255,255,255,.5)" strokeWidth="1.8"/></svg>,
  add: <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>,
  download: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M12 3v13M6 11l6 6 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 20h18" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>,
  check: <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M5 12l5 5 9-9" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  badge: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8"/><circle cx="9" cy="10" r="2" stroke="currentColor" strokeWidth="1.8"/><path d="M6 17c0-2 1.3-3 3-3s3 1 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M14 9h3M14 12h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  work: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  payslip: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.8"/><polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="8" y1="17" x2="12" y2="17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  salary: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M12 6v1.5M12 16.5V18M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1.3 2.5-3 2.5-3 1.1-3 2.5 1.3 2.5 3 2.5 3-1.1 3-2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  holiday: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.8"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  birthday: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M20 16c0 1.1-.9 2-2 2H6a2 2 0 0 1-2-2v-5h16v5z" stroke="currentColor" strokeWidth="1.8"/><rect x="4" y="11" width="16" height="2" stroke="currentColor" strokeWidth="1.8"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M12 3v2M10 5l2-2 2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  advance: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M2 10h20" stroke="currentColor" strokeWidth="1.8"/><circle cx="8" cy="15" r="1.5" fill="currentColor"/></svg>,
  team: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.8"/><circle cx="17" cy="9" r="2" stroke="currentColor" strokeWidth="1.8"/><path d="M2 21c0-4 3.1-7 7-7s7 3 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M17 13c2.2.5 4 2.3 4 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  approval: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  face: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><circle cx="9" cy="10" r="1.5" fill="currentColor"/><circle cx="15" cy="10" r="1.5" fill="currentColor"/><path d="M8.5 15c.8 1.5 2.2 2.5 3.5 2.5s2.7-1 3.5-2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  geofence: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  location: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.3 7 13 7 13s7-7.7 7-13c0-3.9-3.1-7-7-7z" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.8"/></svg>,
  qattend: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M3 10h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M9 16l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  jobs: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M12 12v4M10 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  profile: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  chevron: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  register: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8"/><path d="M3 21c0-4 2.7-7 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M16 11v6M13 14h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  salary2: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M2 7h20M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.8"/><path d="M12 8v1.5M12 14.5V16M9.5 10.5c0-.8.6-1.5 1.5-1.5h2c.8 0 1.5.7 1.5 1.5S13.8 12 13 12h-2c-.8 0-1.5.7-1.5 1.5S10.2 15 11 15h2c.9 0 1.5-.7 1.5-1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  post: <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8"/><path d="M14 2v6h6M12 18v-6M9 15h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

// ═══════════════════════════════════════════════════════════════════════════════
//  APP BAR
// ═══════════════════════════════════════════════════════════════════════════════
function AppBarMain({ user, unread, onBell, onLogout }: { user: User; unread: number; onBell: () => void; onLogout: () => void }) {
  return (
    <div style={{ background: PRIMARY, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, paddingTop: 36 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M3 21V7l9-4 9 4v14M12 21v-7M9 21V12h6v9" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <span style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>HRMS Pro</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {user.role && (
          <span style={{ background: "rgba(255,255,255,.15)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>{roleName(user.role)}</span>
        )}
        <button onClick={onBell} style={{ background: "none", border: "none", cursor: "pointer", position: "relative", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
          {Ic.bell}
          {unread > 0 && <span style={{ position: "absolute", top: 4, right: 4, width: 16, height: 16, background: "#E02424", borderRadius: "50%", fontSize: 9, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{unread > 9 ? "9+" : unread}</span>}
        </button>
        <button onClick={onLogout} style={{ background: "none", border: "none", cursor: "pointer", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
          {Ic.logout}
        </button>
      </div>
    </div>
  );
}

// ── Bottom nav ────────────────────────────────────────────────────────────────
const TABS = [
  { id: "dashboard", icon: Ic.dashboard, label: "Dashboard" },
  { id: "attendance", icon: Ic.attendance, label: "Attendance" },
  { id: "leave", icon: Ic.leave, label: "Leave" },
  { id: "more", icon: Ic.more, label: "More" },
];

function BottomNav({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  return (
    <div style={{ height: 62, background: "#fff", borderTop: "1px solid #E5E7EB", display: "flex", flexShrink: 0 }}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => onSelect(t.id)} style={{ flex: 1, border: "none", background: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, color: active === t.id ? PRIMARY : TEXT2, transition: "color .15s" }}>
          {t.icon}
          <span style={{ fontSize: 10, fontWeight: active === t.id ? 700 : 400 }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LOGIN SCREEN — matches Flutter LoginScreen exactly
// ═══════════════════════════════════════════════════════════════════════════════
function LoginScreen({ onLogin }: { onLogin: (token: string, refresh: string, user: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (!username || !password) { setError("Username and password are required"); return; }
    setLoading(true); setError("");
    try {
      const res = await mapi<any>("/api/mobile/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      onLogin(res.accessToken, res.refreshToken, res.user);
    } catch (e: any) { setError(e.message || "Login failed"); }
    finally { setLoading(false); }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "13px 14px 13px 42px", border: "1.5px solid #E5E7EB", borderRadius: 12, fontSize: 14, background: "#F8FAFC", boxSizing: "border-box", outline: "none", color: TEXT1 };
  const lbl: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: TEXT1, marginBottom: 8 };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: `linear-gradient(145deg, #1A56DB 0%, #0A3A8A 50%, #061D56 100%)`, display: "flex", flexDirection: "column", padding: "0 0 20px" }}>
      {/* Notch spacer */}
      <div style={{ height: 36 }} />

      {/* Header */}
      <div style={{ padding: "30px 28px 0", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <div style={{ width: 90, height: 90, background: "#fff", borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 20px rgba(0,0,0,.25), 0 -2px 6px rgba(255,255,255,.1)" }}>
            <svg width="48" height="48" fill="none" viewBox="0 0 24 24"><path d="M3 21V7l9-4 9 4v14M12 21v-7M9 21V12h6v9" stroke={PRIMARY} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div style={{ position: "absolute", top: -4, right: -4, width: 28, height: 28, background: "rgba(255,255,255,.2)", borderRadius: "50%", border: "1px solid rgba(255,255,255,.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {Ic.settings}
          </div>
        </div>
        <h1 style={{ color: "#fff", fontSize: 34, fontWeight: 800, letterSpacing: .5, marginTop: 22, marginBottom: 6 }}>HRMS Pro</h1>
        <div style={{ background: "rgba(255,255,255,.15)", borderRadius: 20, padding: "4px 16px" }}>
          <span style={{ color: "rgba(255,255,255,.8)", fontSize: 13, letterSpacing: .3 }}>Enterprise HR Management System</span>
        </div>
      </div>

      {/* Login card */}
      <div style={{ margin: "40px 28px 0", background: "#fff", borderRadius: 24, padding: 28, boxShadow: "0 10px 30px rgba(0,0,0,.20)" }}>
        {/* Card header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${PRIMARY}1A`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M15 3h6v18h-6M10 17l5-5-5-5M14 12H3" stroke={PRIMARY} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: TEXT1 }}>Sign In</div>
            <div style={{ fontSize: 12, color: TEXT2 }}>Welcome back! Please sign in to continue.</div>
          </div>
        </div>

        {error && <div style={{ background: "#FEE2E2", color: ERROR, padding: "10px 14px", borderRadius: 10, fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke={ERROR} strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke={ERROR} strokeWidth="1.8" strokeLinecap="round"/></svg>
          {error}
        </div>}

        {/* Username */}
        <label style={lbl}>Username</label>
        <div style={{ position: "relative", marginBottom: 16 }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>{Ic.person}</div>
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter your username" style={inp} />
        </div>

        {/* Password */}
        <label style={lbl}>Password</label>
        <div style={{ position: "relative", marginBottom: 28 }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>{Ic.lock}</div>
          <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password"
            onKeyDown={e => e.key === "Enter" && handle()} style={{ ...inp, paddingRight: 40 }} />
          <button onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
            {showPw ? Ic.eyeOff : Ic.eye}
          </button>
        </div>

        {/* Sign In button */}
        <button onClick={handle} disabled={loading} style={{ width: "100%", height: 52, background: loading ? "#93B3F5" : PRIMARY, color: "#fff", border: "none", borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: `0 4px 14px ${PRIMARY}55` }}>
          {loading ? <>
            <div style={{ width: 20, height: 20, border: "2px solid rgba(255,255,255,.4)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
            Signing in…
          </> : <>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M15 3h6v18h-6M10 17l5-5-5-5M14 12H3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Sign In
          </>}
        </button>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 24, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ width: 30, height: 1, background: "rgba(255,255,255,.24)" }} />
          <div style={{ padding: "0 10px", display: "flex", alignItems: "center", gap: 4 }}>
            {Ic.settings}
            <span style={{ color: "rgba(255,255,255,.38)", fontSize: 11 }}>Server Config · HRMS Pro v1.0</span>
          </div>
          <div style={{ width: 30, height: 1, background: "rgba(255,255,255,.24)" }} />
        </div>
        <div style={{ marginTop: 6, color: "rgba(255,255,255,.5)", fontSize: 11 }}>Admin: admin / admin123 · Employee: mobile / DOB</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD SCREEN — matches Flutter DashboardScreen
// ═══════════════════════════════════════════════════════════════════════════════
function DashboardTab({ token, user }: { token: string; user: User }) {
  const [data, setData] = useState<DashData>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    mapi<DashData>("/api/mobile/dashboard", {}, token)
      .then(d => setData(d)).catch(() => setData({}))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const initials = `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "?";

  const att = data.todayAttendance;
  const clockedIn = !!att?.clockIn;

  return (
    <div style={{ flex: 1, overflowY: "auto", background: BG, paddingBottom: 16 }}>
      {loading ? <Spinner full /> : (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Welcome card */}
          <Card style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: PRIMARY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{initials}</div>
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontSize: 14, color: TEXT2 }}>Welcome back,</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: TEXT1, lineHeight: 1.2 }}>{user.firstName} {user.lastName}</div>
                {data.employee && <div style={{ fontSize: 13, color: TEXT2, marginTop: 2 }}>{data.employee.designation}{data.employee.designation && data.employee.department ? " • " : ""}{data.employee.department}</div>}
              </div>
            </div>
          </Card>

          {/* 2×2 status cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { title: "Today", value: clockedIn ? "Present" : "Not Marked", icon: clockedIn ? Ic.check : "✕", color: clockedIn ? ACCENT : ERROR },
              { title: "Pending Leaves", value: String(data.pendingLeaves ?? 0), icon: Ic.leave, color: WARN },
              { title: "Job Applications", value: String(data.jobApplications ?? 0), icon: Ic.work, color: PRIMARY },
              { title: "Employee Code", value: data.employee?.employeeCode ?? "N/A", icon: Ic.badge, color: PRIMARY_D },
            ].map((s, i) => (
              <Card key={i} style={{ padding: 14 }}>
                <div style={{ color: s.color, marginBottom: 8 }}>
                  {typeof s.icon === "string" ? (
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: s.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 700 }}>{s.icon}</div>
                  ) : (
                    <div style={{ color: s.color }}>{s.icon}</div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: TEXT2 }}>{s.title}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: TEXT1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.value}</div>
              </Card>
            ))}
          </div>

          {/* Today's attendance detail */}
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT1, marginBottom: 12 }}>Today's Attendance</div>
            {!att ? (
              <div style={{ color: TEXT2, fontSize: 14 }}>No attendance record for today</div>
            ) : (
              [
                ["Clock In", att.clockIn ?? "-"],
                ["Clock Out", att.clockOut ?? "-"],
                ["Work Hours", att.workHours ?? "-"],
                ["Status", att.status ?? "-"],
              ].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 6, paddingBottom: 6, borderBottom: "1px solid #F3F4F6" }}>
                  <span style={{ color: TEXT2, fontSize: 14 }}>{l}</span>
                  <span style={{ fontWeight: 500, color: TEXT1, fontSize: 14 }}>{v}</span>
                </div>
              ))
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ATTENDANCE SCREEN — matches Flutter AttendanceScreen
// ═══════════════════════════════════════════════════════════════════════════════
function AttendanceTab({ token }: { token: string }) {
  const [today, setToday] = useState<any>(null);
  const [history, setHistory] = useState<AttRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pulse, setPulse] = useState(true);

  useEffect(() => { const t = setInterval(() => setPulse(p => !p), 1200); return () => clearInterval(t); }, []);

  const load = useCallback(() => {
    setLoading(true);
    const now = new Date();
    Promise.all([
      mapi("/api/mobile/attendance/today", {}, token).catch(() => null),
      mapi(`/api/mobile/attendance/history?month=${now.getMonth()+1}&year=${now.getFullYear()}`, {}, token).catch(() => []),
    ]).then(([t, h]) => { setToday(t); setHistory((h as AttRec[]).slice(0, 15)); })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const punch = async () => {
    setPunching(true); setMsg(null);
    try {
      const res = await mapi<any>("/api/mobile/attendance/punch", { method: "POST", body: JSON.stringify({ latitude: null, longitude: null }) }, token);
      setMsg({ text: res.punchType === "clock_in" ? "Punched In successfully" : "Punched Out successfully", ok: true });
      load();
    } catch (e: any) { setMsg({ text: e.message, ok: false }); }
    finally { setPunching(false); }
  };

  const hasIn  = !!today?.clockIn;
  const hasOut = !!today?.clockOut;
  const isFirstPunch = !hasIn;
  const punchLabel = isFirstPunch ? "Punch In" : "Punch Out";
  const punchBg = isFirstPunch ? `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_D})` : `linear-gradient(135deg, ${ACCENT}, #047481)`;
  const ringColor = isFirstPunch ? PRIMARY : ACCENT;

  return (
    <div style={{ flex: 1, overflowY: "auto", background: BG, paddingBottom: 16 }}>
      {loading ? <Spinner full /> : (
        <div style={{ padding: 16 }}>

          {msg && (
            <div style={{ background: msg.ok ? "#DCFCE7" : "#FEE2E2", color: msg.ok ? "#16A34A" : ERROR, padding: "12px 16px", borderRadius: 10, fontSize: 14, marginBottom: 14, textAlign: "center", fontWeight: 500 }}>
              {msg.ok && "✓ "}{msg.text}
            </div>
          )}

          {/* Punch button card */}
          <Card style={{ padding: "28px 16px", marginBottom: 14, textAlign: "center" }}>
            <div style={{ fontSize: 13, color: TEXT2, marginBottom: 24 }}>
              {isFirstPunch ? "Tap the button to clock in today" : hasOut ? "Tap to update clock-out time" : "Tap the button to clock out"}
            </div>

            {/* Animated punch button */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
              <div style={{ width: 170, height: 170, borderRadius: "50%", background: `${ringColor}18`, display: "flex", alignItems: "center", justifyContent: "center", transform: pulse && !punching ? "scale(1.04)" : "scale(1)", transition: "transform 1.2s ease-in-out" }}>
                <button onClick={punch} disabled={punching} style={{
                  width: 140, height: 140, borderRadius: "50%", background: punchBg, color: "#fff", border: "none", cursor: punching ? "not-allowed" : "pointer",
                  fontSize: 16, fontWeight: 800, letterSpacing: .5, boxShadow: `0 6px 24px ${ringColor}55`, opacity: punching ? .75 : 1, transition: "transform .1s, opacity .2s", transform: punching ? "scale(.96)" : "scale(1)"
                }}>
                  {punching ? <div style={{ width: 28, height: 28, border: "3px solid rgba(255,255,255,.4)", borderTop: "3px solid #fff", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "auto" }} /> : punchLabel}
                </button>
              </div>
            </div>

            {/* Today times */}
            {hasIn && (
              <div style={{ marginTop: 22, display: "flex", justifyContent: "center", gap: 20 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: TEXT2 }}>Clock In</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: ACCENT }}>{today.clockIn}</div>
                </div>
                {hasOut && <>
                  <div style={{ color: TEXT2, fontSize: 18, alignSelf: "center" }}>→</div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: TEXT2 }}>Clock Out</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#F97316" }}>{today.clockOut}</div>
                  </div>
                  {today.workHours && <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: TEXT2 }}>Hours</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: PRIMARY }}>{today.workHours}</div>
                  </div>}
                </>}
              </div>
            )}
          </Card>

          {/* History */}
          <div style={{ fontSize: 16, fontWeight: 700, color: TEXT1, marginBottom: 10 }}>Attendance History</div>
          {history.length === 0 ? (
            <div style={{ textAlign: "center", color: TEXT2, padding: 30 }}>No records found</div>
          ) : history.map(r => (
            <Card key={r.id} style={{ marginBottom: 8, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: TEXT1 }}>{new Date(r.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</div>
                  <div style={{ fontSize: 12, color: TEXT2, marginTop: 2 }}>{r.clockIn || "—"} → {r.clockOut || "—"}</div>
                </div>
                <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <StatusBadge status={r.status} />
                  {r.workHours && <span style={{ fontSize: 12, color: TEXT2 }}>{r.workHours} hrs</span>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LEAVE SCREEN — matches Flutter LeaveScreen
// ═══════════════════════════════════════════════════════════════════════════════
function LeaveTab({ token }: { token: string }) {
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<LeaveReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [showApply, setShowApply] = useState(false);
  const [form, setForm] = useState({ leaveTypeId: "", startDate: "", endDate: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      mapi<LeaveType[]>("/api/mobile/leave-types", {}, token).catch(() => []),
      mapi<LeaveReq[]>("/api/mobile/leave-requests", {}, token).catch(() => []),
    ]).then(([t, r]) => { setTypes(t); setRequests(r); })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.leaveTypeId || !form.startDate || !form.endDate) { setMsg({ text: "Fill all required fields", ok: false }); return; }
    setSubmitting(true); setMsg(null);
    try {
      await mapi("/api/mobile/leave-requests", { method: "POST", body: JSON.stringify(form) }, token);
      setMsg({ text: "Leave applied successfully", ok: true });
      setShowApply(false);
      setForm({ leaveTypeId: "", startDate: "", endDate: "", reason: "" });
      load();
    } catch (e: any) { setMsg({ text: e.message, ok: false }); }
    finally { setSubmitting(false); }
  };

  const selStyle: React.CSSProperties = { width: "100%", padding: "13px 14px", border: `1.5px solid #E5E7EB`, borderRadius: 12, fontSize: 14, background: "#F8FAFC", boxSizing: "border-box", outline: "none", color: TEXT1, appearance: "none" };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: BG, paddingBottom: 80 }}>
      {loading ? <Spinner full /> : (
        <div style={{ padding: 16 }}>
          {msg && <div style={{ background: msg.ok ? "#DCFCE7" : "#FEE2E2", color: msg.ok ? "#16A34A" : ERROR, padding: "12px 16px", borderRadius: 10, fontSize: 14, marginBottom: 14, textAlign: "center" }}>{msg.ok && "✓ "}{msg.text}</div>}

          {/* Apply form inline */}
          {showApply && (
            <Card style={{ padding: 16, marginBottom: 14, border: `1.5px solid ${PRIMARY}22` }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: TEXT1, marginBottom: 14 }}>Apply Leave</div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TEXT1, marginBottom: 6 }}>Leave Type *</label>
                <select value={form.leaveTypeId} onChange={e => setForm(f => ({ ...f, leaveTypeId: e.target.value }))} style={selStyle}>
                  <option value="">Select leave type</option>
                  {types.map(t => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TEXT1, marginBottom: 6 }}>Start Date *</label>
                  <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} style={{ ...selStyle }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TEXT1, marginBottom: 6 }}>End Date *</label>
                  <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} style={{ ...selStyle }} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TEXT1, marginBottom: 6 }}>Reason</label>
                <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={3} placeholder="Optional reason" style={{ ...selStyle, resize: "none" }} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowApply(false)} style={{ flex: 1, padding: 12, border: `1.5px solid #E5E7EB`, borderRadius: 10, background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", color: TEXT2 }}>Cancel</button>
                <button onClick={submit} disabled={submitting} style={{ flex: 1, padding: 12, background: PRIMARY, border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, color: "#fff", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? .7 : 1 }}>
                  {submitting ? "Submitting…" : "Submit"}
                </button>
              </div>
            </Card>
          )}

          {/* Leave Balance — matches Flutter's half-width tiles */}
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT1, marginBottom: 12 }}>Leave Balance</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
            {types.length === 0 ? (
              <div style={{ color: TEXT2, fontSize: 14 }}>No leave types configured</div>
            ) : types.map(t => (
              <div key={t.id} style={{ width: "calc(50% - 4px)", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: 12, boxSizing: "border-box" }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: PRIMARY }}>{t.code}</div>
                <div style={{ fontSize: 12, color: TEXT2 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: TEXT1, marginTop: 2 }}>{t.daysPerYear ?? t.daysAllowed ?? t.annualEntitlement ?? 0} days/year</div>
              </div>
            ))}
          </div>

          {/* Leave requests */}
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT1, marginBottom: 12 }}>My Leave Requests</div>
          {requests.length === 0 ? (
            <Card style={{ padding: 20 }}>
              <div style={{ textAlign: "center", color: TEXT2 }}>No leave requests yet</div>
            </Card>
          ) : requests.map(r => (
            <Card key={r.id} style={{ marginBottom: 8, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontWeight: 500, fontSize: 14, color: TEXT1 }}>{r.startDate} – {r.endDate}</div>
                <StatusBadge status={r.status} />
              </div>
              <div style={{ fontSize: 13, color: TEXT2, marginTop: 4 }}>{r.days ?? ""} day(s){r.leaveType ? ` · ${r.leaveType}` : ""}</div>
              {r.reason && <div style={{ fontSize: 13, color: TEXT2, marginTop: 2 }}>{r.reason}</div>}
            </Card>
          ))}
        </div>
      )}

      {/* FAB — Apply Leave */}
      {!showApply && (
        <button onClick={() => setShowApply(true)} style={{ position: "absolute", bottom: 74, right: 20, background: PRIMARY, color: "#fff", border: "none", borderRadius: 30, padding: "12px 20px", display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: `0 4px 16px ${PRIMARY}55`, zIndex: 10 }}>
          {Ic.add} Apply Leave
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PAYSLIP SCREEN — matches Flutter PayslipScreen
// ═══════════════════════════════════════════════════════════════════════════════
function PayslipScreen({ token, onBack }: { token: string; onBack: () => void }) {
  const [list, setList] = useState<Payslip[]>([]);
  const [selected, setSelected] = useState<Payslip | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    mapi<Payslip[]>("/api/mobile/payslips", {}, token).then(setList).catch(() => setList([])).finally(() => setLoading(false));
  }, [token]);

  const loadDetail = async (p: Payslip) => {
    setLoadingDetail(true);
    try {
      const d = await mapi<Payslip>(`/api/mobile/payslips/${p.month}/${p.year}`, {}, token);
      setSelected({ ...p, ...d });
    } catch { setSelected(p); }
    finally { setLoadingDetail(false); }
  };

  if (loading) return (
    <div style={{ flex: 1, overflowY: "auto", background: BG }}>
      <div style={{ background: PRIMARY, padding: "10px 16px 10px", display: "flex", alignItems: "center", gap: 12, paddingTop: 36 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", padding: 4, display: "flex" }}>{Ic.back}</button>
        <span style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>Pay Slips</span>
      </div>
      <Spinner full />
    </div>
  );

  if (selected) {
    const p = selected;
    const net = p.netPay ?? p.netSalary ?? 0;
    const gross = p.grossSalary ?? p.grossEarnings ?? 0;
    const row = (label: string, value: any, bold?: boolean, color?: string) => (
      value != null && Number(value) !== 0 ? (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #F3F4F6" }}>
          <span style={{ color: TEXT2, fontSize: 13 }}>{label}</span>
          <span style={{ fontWeight: bold ? 700 : 500, color: color || TEXT1, fontSize: 13 }}>{fmt(value)}</span>
        </div>
      ) : null
    );
    return (
      <div style={{ flex: 1, overflowY: "auto", background: BG }}>
        <div style={{ background: PRIMARY, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, paddingTop: 36 }}>
          <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", padding: 4, display: "flex" }}>{Ic.back}</button>
          <span style={{ color: "#fff", fontSize: 17, fontWeight: 700, flex: 1 }}>Pay Slips</span>
        </div>
        {loadingDetail ? <Spinner full /> : (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Title row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: TEXT1 }}>Payslip — {p.month} {p.year}</span>
            </div>

            {/* Employee Details */}
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: PRIMARY, marginBottom: 8 }}>Employee Details</div>
              {[
                ["Name", p.employeeName],
                ["Employee Code", p.employeeCode],
                ["Department", p.department],
                ["Designation", p.designation],
                ["Company", p.companyName],
                ["Pay Period", `${p.month} ${p.year}`],
              ].map(([l, v]) => v ? (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #F3F4F6" }}>
                  <span style={{ color: TEXT2, fontSize: 13 }}>{l}</span>
                  <span style={{ fontWeight: 500, color: TEXT1, fontSize: 13 }}>{v}</span>
                </div>
              ) : null)}
            </Card>

            {/* Earnings */}
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: ACCENT, marginBottom: 8 }}>Earnings</div>
              {row("Basic Salary", p.basicSalary)}
              {row("HRA", p.hra)}
              {row("DA", p.da)}
              {row("Conveyance", p.conveyance)}
              {row("Special Allowance", p.specialAllowance)}
              {row("Other Earnings", (p.otherEarnings || 0) + (p.medicalAllowance || 0))}
              {row("Monthly Bonus", p.monthlyBonus)}
              <div style={{ borderTop: `1.5px solid #E5E7EB`, marginTop: 4, paddingTop: 6 }}>
                {row("Gross Earnings", gross, true, ACCENT)}
              </div>
            </Card>

            {/* Deductions */}
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: ERROR, marginBottom: 8 }}>Deductions</div>
              {row("PF (Employee)", p.pfEmployee)}
              {row("ESIC (Employee)", p.esicEmployee)}
              {row("Professional Tax", p.professionalTax)}
              {row("TDS", p.tds)}
              {row("LWF", p.lwf)}
              {row("Other Deductions", p.otherDeductions)}
              <div style={{ borderTop: `1.5px solid #E5E7EB`, marginTop: 4, paddingTop: 6 }}>
                {row("Total Deductions", p.totalDeductions, true, ERROR)}
              </div>
            </Card>

            {/* Net Pay */}
            <div style={{ background: PRIMARY, borderRadius: 8, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>Net Pay (Take Home)</span>
              <span style={{ color: "#fff", fontSize: 22, fontWeight: 800 }}>{fmt(net)}</span>
            </div>

            <p style={{ textAlign: "center", fontSize: 11, color: TEXT2 }}>This is a system-generated payslip and does not require a signature.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", background: BG }}>
      <div style={{ background: PRIMARY, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, paddingTop: 36 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", padding: 4, display: "flex" }}>{Ic.back}</button>
        <span style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>Pay Slips</span>
      </div>
      {list.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 40, color: TEXT2 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: TEXT1, marginBottom: 8 }}>No payslips available</div>
          <div style={{ fontSize: 13, textAlign: "center" }}>Payslips are generated by your HR/Admin after payroll processing.</div>
        </div>
      ) : (
        <div style={{ padding: 16 }}>
          {list.map(p => {
            const net = p.netPay ?? p.netSalary ?? 0;
            const gross = p.grossSalary ?? p.grossEarnings ?? 0;
            const month3 = String(p.month).substring(0, 3).toUpperCase();
            return (
              <Card key={p.id} style={{ marginBottom: 10, cursor: "pointer" }} onClick={() => loadDetail(p)}>
                <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", gap: 14 }}>
                  <div style={{ width: 48, height: 48, background: `${PRIMARY}1A`, borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: PRIMARY }}>{month3}</span>
                    <span style={{ fontSize: 10, color: PRIMARY }}>{p.year}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: TEXT1, fontSize: 15 }}>{p.month} {p.year}</div>
                    <div style={{ fontSize: 12, color: TEXT2 }}>Gross: {fmt(gross)} · Net: {fmt(net)}</div>
                  </div>
                  {Ic.chevron}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  NOTIFICATIONS SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function NotificationsScreen({ token, onBack }: { token: string; onBack: () => void }) {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    mapi<Notif[]>("/api/mobile/notifications", {}, token).then(setNotifs).catch(() => setNotifs([])).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id: string) => {
    await mapi(`/api/mobile/notifications/${id}/read`, { method: "POST" }, token).catch(() => {});
    setNotifs(n => n.map(x => x.id === id ? { ...x, isRead: true } : x));
  };

  const markAll = async () => {
    await Promise.all(notifs.filter(n => !n.isRead).map(n => mapi(`/api/mobile/notifications/${n.id}/read`, { method: "POST" }, token).catch(() => {})));
    setNotifs(n => n.map(x => ({ ...x, isRead: true })));
  };

  const unread = notifs.filter(n => !n.isRead).length;

  return (
    <div style={{ flex: 1, overflowY: "auto", background: BG }}>
      <div style={{ background: PRIMARY, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, paddingTop: 36 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", padding: 4, display: "flex" }}>{Ic.back}</button>
        <span style={{ color: "#fff", fontSize: 17, fontWeight: 700, flex: 1 }}>Notifications</span>
        {unread > 0 && <button onClick={markAll} style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>Mark all read</button>}
      </div>
      {loading ? <Spinner full /> : notifs.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: TEXT2 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
          <div>No notifications</div>
        </div>
      ) : (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {notifs.map(n => (
            <Card key={n.id} style={{ padding: 14, borderLeft: `4px solid ${n.isRead ? "#E5E7EB" : PRIMARY}`, cursor: "pointer" }} onClick={() => markRead(n.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: n.isRead ? 500 : 700, fontSize: 14, color: TEXT1 }}>{n.title}</span>
                {!n.isRead && <div style={{ width: 8, height: 8, borderRadius: "50%", background: PRIMARY, flexShrink: 0, marginTop: 4 }} />}
              </div>
              <div style={{ fontSize: 13, color: TEXT2, marginBottom: 4 }}>{n.message}</div>
              <div style={{ fontSize: 11, color: TEXT2 }}>{new Date(n.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LEAVE APPROVAL SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function LeaveApprovalScreen({ token, onBack }: { token: string; onBack: () => void }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    mapi<any[]>("/api/mobile/team-leave-requests", {}, token).then(setRequests).catch(() => setRequests([])).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, status: "approved" | "rejected") => {
    setActing(id);
    try {
      await mapi(`/api/leave-requests/${id}`, { method: "PUT", body: JSON.stringify({ status }) }, token);
      setMsg({ text: `Leave ${status} successfully`, ok: true });
      load();
    } catch (e: any) { setMsg({ text: e.message, ok: false }); }
    finally { setActing(null); }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: BG }}>
      <div style={{ background: "#4CAF50", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, paddingTop: 36 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", padding: 4, display: "flex" }}>{Ic.back}</button>
        <span style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>Leave Approval</span>
      </div>
      {msg && <div style={{ background: msg.ok ? "#DCFCE7" : "#FEE2E2", color: msg.ok ? "#16A34A" : ERROR, padding: "12px 16px", fontSize: 14, textAlign: "center" }}>{msg.ok && "✓ "}{msg.text}</div>}
      {loading ? <Spinner full /> : requests.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: TEXT2 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 600, color: TEXT1 }}>No pending leave requests</div>
        </div>
      ) : (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {requests.map((r: any) => (
            <Card key={r.id} style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: TEXT1 }}>{r.employeeName ?? r.firstName + " " + r.lastName ?? "Employee"}</div>
                  <div style={{ fontSize: 13, color: TEXT2 }}>{r.startDate} – {r.endDate} · {r.days ?? "?"} day(s)</div>
                  {r.reason && <div style={{ fontSize: 12, color: TEXT2, marginTop: 2 }}>{r.reason}</div>}
                </div>
                <StatusBadge status={r.status} />
              </div>
              {r.status === "pending" && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => act(r.id, "approved")} disabled={acting === r.id} style={{ flex: 1, padding: "9px 0", background: "#4CAF50", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    {acting === r.id ? "…" : "✓ Approve"}
                  </button>
                  <button onClick={() => act(r.id, "rejected")} disabled={acting === r.id} style={{ flex: 1, padding: "9px 0", background: ERROR, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    {acting === r.id ? "…" : "✕ Reject"}
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MY TEAM SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function MyTeamScreen({ token, onBack }: { token: string; onBack: () => void }) {
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mapi<any[]>("/api/mobile/my-team", {}, token).then(setTeam).catch(() => setTeam([])).finally(() => setLoading(false));
  }, [token]);

  return (
    <div style={{ flex: 1, overflowY: "auto", background: BG }}>
      <div style={{ background: PRIMARY_D, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, paddingTop: 36 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", padding: 4, display: "flex" }}>{Ic.back}</button>
        <span style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>My Team</span>
      </div>
      {loading ? <Spinner full /> : team.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: TEXT2 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
          <div style={{ fontWeight: 600, color: TEXT1 }}>No team members found</div>
        </div>
      ) : (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {team.map((m: any, i: number) => {
            const initials = `${m.firstName?.[0] ?? ""}${m.lastName?.[0] ?? ""}`.toUpperCase() || "?";
            return (
              <Card key={m.id ?? i} style={{ padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 46, height: 46, borderRadius: "50%", background: PRIMARY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{initials}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: TEXT1 }}>{m.firstName} {m.lastName}</div>
                    <div style={{ fontSize: 13, color: TEXT2 }}>{m.designation}{m.designation && m.department ? " · " : ""}{m.department}</div>
                    {m.employeeCode && <div style={{ fontSize: 12, color: TEXT2 }}>{m.employeeCode}</div>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PROFILE SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function ProfileScreen({ token, user, onBack }: { token: string; user: User; onBack: () => void }) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mapi<any>("/api/mobile/profile", {}, token).then(setProfile).catch(() => setProfile({})).finally(() => setLoading(false));
  }, [token]);

  const initials = `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "?";

  return (
    <div style={{ flex: 1, overflowY: "auto", background: BG }}>
      <div style={{ background: PRIMARY, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, paddingTop: 36 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", padding: 4, display: "flex" }}>{Ic.back}</button>
        <span style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>My Profile</span>
      </div>
      {loading ? <Spinner full /> : (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12, paddingBottom: 8 }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: PRIMARY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700, color: "#fff", marginBottom: 12 }}>{initials}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: TEXT1 }}>{user.firstName} {user.lastName}</div>
            <div style={{ fontSize: 13, color: TEXT2 }}>{roleName(user.role)}</div>
          </div>
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: PRIMARY, marginBottom: 10 }}>Personal Details</div>
            {[
              ["Employee Code", profile?.employeeCode],
              ["Department", profile?.department],
              ["Designation", profile?.designation],
              ["Mobile", profile?.mobileNumber],
              ["Date of Birth", profile?.dateOfBirth],
              ["Gender", profile?.gender],
              ["Blood Group", profile?.bloodGroup],
              ["Joining Date", profile?.dateOfJoining],
            ].filter(([, v]) => v).map(([l, v]) => (
              <div key={l as string} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F3F4F6" }}>
                <span style={{ color: TEXT2, fontSize: 13 }}>{l}</span>
                <span style={{ fontWeight: 500, color: TEXT1, fontSize: 13 }}>{v}</span>
              </div>
            ))}
          </Card>
          {(profile?.bankName || profile?.accountNumber) && (
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: PRIMARY, marginBottom: 10 }}>Bank Details</div>
              {[
                ["Bank Name", profile?.bankName],
                ["Account No.", profile?.accountNumber],
                ["IFSC Code", profile?.ifscCode],
                ["PAN", profile?.panNumber],
                ["Aadhaar", profile?.aadhaarNumber],
              ].filter(([, v]) => v).map(([l, v]) => (
                <div key={l as string} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F3F4F6" }}>
                  <span style={{ color: TEXT2, fontSize: 13 }}>{l}</span>
                  <span style={{ fontWeight: 500, color: TEXT1, fontSize: 13 }}>{v}</span>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ADVANCE & LOAN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function AdvanceLoanScreen({ token, onBack }: { token: string; onBack: () => void }) {
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "advance", amount: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    mapi<any[]>("/api/mobile/loan-advances", {}, token).then(setLoans).catch(() => setLoans([])).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.amount) { setMsg({ text: "Enter amount", ok: false }); return; }
    setSubmitting(true);
    try {
      await mapi("/api/mobile/loan-advances", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount) }) }, token);
      setMsg({ text: "Request submitted successfully", ok: true });
      setShowForm(false); setForm({ type: "advance", amount: "", reason: "" }); load();
    } catch (e: any) { setMsg({ text: e.message, ok: false }); }
    finally { setSubmitting(false); }
  };

  const selStyle: React.CSSProperties = { width: "100%", padding: "12px 14px", border: "1.5px solid #E5E7EB", borderRadius: 12, fontSize: 14, background: "#F8FAFC", boxSizing: "border-box", outline: "none", color: TEXT1 };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: BG }}>
      <div style={{ background: "#43A047", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, paddingTop: 36 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", padding: 4, display: "flex" }}>{Ic.back}</button>
        <span style={{ color: "#fff", fontSize: 17, fontWeight: 700, flex: 1 }}>Advance & Loan</span>
        <button onClick={() => setShowForm(s => !s)} style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Request</button>
      </div>
      {msg && <div style={{ background: msg.ok ? "#DCFCE7" : "#FEE2E2", color: msg.ok ? "#16A34A" : ERROR, padding: "12px 16px", fontSize: 14, textAlign: "center" }}>{msg.ok && "✓ "}{msg.text}</div>}
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {showForm && (
          <Card style={{ padding: 16, border: `1.5px solid #43A04722` }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT1, marginBottom: 14 }}>New Request</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TEXT1, marginBottom: 6 }}>Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ ...selStyle, appearance: "none" }}>
                <option value="advance">Salary Advance</option>
                <option value="loan">Loan</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TEXT1, marginBottom: 6 }}>Amount (₹)</label>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="Enter amount" style={selStyle} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TEXT1, marginBottom: 6 }}>Reason</label>
              <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={3} placeholder="Reason for request" style={{ ...selStyle, resize: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: 11, border: "1.5px solid #E5E7EB", borderRadius: 10, background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", color: TEXT2 }}>Cancel</button>
              <button onClick={submit} disabled={submitting} style={{ flex: 1, padding: 11, background: "#43A047", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, color: "#fff", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? .7 : 1 }}>{submitting ? "Submitting…" : "Submit"}</button>
            </div>
          </Card>
        )}
        {loading ? <Spinner /> : loans.length === 0 ? (
          <div style={{ textAlign: "center", padding: 30, color: TEXT2 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💳</div>
            <div style={{ fontWeight: 600, color: TEXT1, marginBottom: 4 }}>No requests yet</div>
            <div style={{ fontSize: 13 }}>Tap "+ Request" to apply for advance or loan</div>
          </div>
        ) : loans.map((l: any, i: number) => (
          <Card key={l.id ?? i} style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: TEXT1 }}>{l.type === "loan" ? "Loan" : "Salary Advance"}</div>
                <div style={{ fontSize: 14, color: TEXT2, marginTop: 2 }}>Amount: {fmt(l.amount)}</div>
                {l.reason && <div style={{ fontSize: 13, color: TEXT2, marginTop: 2 }}>{l.reason}</div>}
              </div>
              <StatusBadge status={l.status ?? "pending"} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MOBILE-ONLY FEATURE MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function MobileOnlyModal({ title, icon, color, onClose }: { title: string; icon: React.ReactNode; color: string; onClose: () => void }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "flex-end", zIndex: 50 }} onClick={onClose}>
      <div style={{ background: "#fff", width: "100%", borderRadius: "20px 20px 0 0", padding: 28 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", color }}>{icon}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT1 }}>{title}</div>
          <div style={{ fontSize: 14, color: TEXT2, textAlign: "center", lineHeight: 1.5 }}>
            This feature is fully available in the <strong>HRMS Pro Flutter mobile app</strong>. Download and install the APK to use it on your device.
          </div>
        </div>
        <button onClick={onClose} style={{ width: "100%", padding: 14, background: color, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Got it</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MORE SCREEN — matches Flutter _MoreScreen with 3-column grid
// ═══════════════════════════════════════════════════════════════════════════════
const MANAGER_ROLES = ["super_admin", "company_admin", "hr_admin", "manager"];

function MoreTab({ token, user, onPayslip, onSelect }: { token: string; user: User; onPayslip: () => void; onSelect: (s: string) => void }) {
  const isManager = MANAGER_ROLES.includes(user.role);
  const hasCompany = !!(user.companyId || user.hasCompany);
  const [mobileOnly, setMobileOnly] = useState<{ title: string; icon: React.ReactNode; color: string } | null>(null);

  const mob = (title: string, icon: React.ReactNode, color: string) => () => setMobileOnly({ title, icon, color });

  type MenuItem = { icon: React.ReactNode; title: string; subtitle: string; color: string; action: () => void };

  const employeeItems: MenuItem[] = hasCompany ? [
    { icon: Ic.profile,  title: "My Profile",        subtitle: "Personal details",  color: PRIMARY,    action: () => onSelect("profile") },
    { icon: Ic.payslip,  title: "Pay Slips",          subtitle: "View & download",   color: ACCENT,     action: onPayslip },
    { icon: Ic.salary,   title: "Salary Structure",   subtitle: "View breakup",      color: "#9C27B0",  action: mob("Salary Structure", Ic.salary, "#9C27B0") },
    { icon: Ic.holiday,  title: "Holiday Calendar",   subtitle: "Company holidays",  color: "#FF8800",  action: mob("Holiday Calendar", Ic.holiday, "#FF8800") },
    { icon: Ic.jobs,     title: "Job Board",          subtitle: "Browse positions",  color: "#00BCD4",  action: mob("Job Board", Ic.jobs, "#00BCD4") },
    { icon: Ic.birthday, title: "Birthday List",      subtitle: "Team birthdays",    color: "#FF9800",  action: mob("Birthday List", Ic.birthday, "#FF9800") },
    { icon: Ic.advance,  title: "Advance & Loan",     subtitle: "Salary advance",    color: "#43A047",  action: () => onSelect("advanceLoan") },
  ] : [];

  const managerItems: MenuItem[] = isManager ? [
    { icon: Ic.approval,  title: "Leave Approval",      subtitle: "Approve/reject",    color: "#4CAF50",  action: () => onSelect("leaveApproval") },
    { icon: Ic.team,      title: "My Team",             subtitle: "View members",      color: PRIMARY_D,  action: () => onSelect("team") },
    { icon: Ic.qattend,   title: "Quick Attendance",    subtitle: "Single day entry",  color: "#795548",  action: mob("Quick Attendance", Ic.qattend, "#795548") },
    { icon: Ic.qattend,   title: "Monthly Attendance",  subtitle: "Monthly pay days",  color: "#607D8B",  action: mob("Monthly Attendance", Ic.qattend, "#607D8B") },
    { icon: Ic.register,  title: "Register Employee",   subtitle: "Add new employee",  color: "#3F51B5",  action: mob("Register Employee", Ic.register, "#3F51B5") },
    { icon: Ic.face,      title: "Face Registration",   subtitle: "Register faces",    color: "#6366F1",  action: mob("Face Registration", Ic.face, "#6366F1") },
    { icon: Ic.geofence,  title: "Geo-Fence Setup",     subtitle: "Office radius",     color: "#0288D1",  action: mob("Geo-Fence Setup", Ic.geofence, "#0288D1") },
    { icon: Ic.salary2,   title: "Salary Setup",        subtitle: "Create/update",     color: "#009688",  action: mob("Salary Setup", Ic.salary2, "#009688") },
    { icon: Ic.post,      title: "Job Postings",        subtitle: "Manage posts",      color: "#E91E63",  action: mob("Job Postings", Ic.post, "#E91E63") },
    { icon: Ic.location,  title: "Locations",           subtitle: "Office branches",   color: "#43A047",  action: mob("Locations", Ic.location, "#43A047") },
  ] : [];

  const tile = (item: MenuItem, i: number) => (
    <div key={i} onClick={item.action} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", boxShadow: "0 1px 4px rgba(0,0,0,.08)", padding: "12px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "center", transition: "box-shadow .15s" }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: `${item.color}18`, display: "flex", alignItems: "center", justifyContent: "center", color: item.color, flexShrink: 0 }}>
        {item.icon}
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: TEXT1, lineHeight: 1.2 }}>{item.title}</div>
        <div style={{ fontSize: 9, color: TEXT2, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 80 }}>{item.subtitle}</div>
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", background: BG, padding: 16, paddingBottom: 16, position: "relative" }}>
      {hasCompany && <>
        <div style={{ fontSize: 16, fontWeight: 700, color: TEXT1, marginBottom: 12 }}>Employee Services</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
          {employeeItems.map((item, i) => tile(item, i))}
        </div>
      </>}

      {isManager && <>
        <div style={{ fontSize: 16, fontWeight: 700, color: TEXT1, marginBottom: 12 }}>Manager Tools</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {managerItems.map((item, i) => tile(item, i))}
        </div>
      </>}

      {!hasCompany && !isManager && (
        <div style={{ textAlign: "center", padding: 40, color: TEXT2 }}>
          <div style={{ fontSize: 13 }}>No features available for your account</div>
        </div>
      )}

      {mobileOnly && <MobileOnlyModal title={mobileOnly.title} icon={mobileOnly.icon} color={mobileOnly.color} onClose={() => setMobileOnly(null)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function MobilePreview() {
  const [token, setToken] = useState(() => sessionStorage.getItem("m_token") ?? "");
  const [user, setUser] = useState<User | null>(() => {
    try { return JSON.parse(sessionStorage.getItem("m_user") ?? "null"); } catch { return null; }
  });
  const [tab, setTab] = useState("dashboard");
  const [overlay, setOverlay] = useState<"payslip" | "notifications" | "leaveApproval" | "team" | "profile" | "advanceLoan" | null>(null);
  const [unread, setUnread] = useState(0);

  const isLoggedIn = !!(token && user);

  useEffect(() => {
    if (!token) return;
    mapi<any>("/api/mobile/notifications", {}, token)
      .then(ns => setUnread((ns as Notif[]).filter((n: Notif) => !n.isRead).length))
      .catch(() => {});
  }, [token, overlay]);

  const login = (tok: string, _ref: string, u: User) => {
    sessionStorage.setItem("m_token", tok);
    sessionStorage.setItem("m_user", JSON.stringify(u));
    setToken(tok); setUser(u);
  };

  const logout = () => {
    sessionStorage.removeItem("m_token"); sessionStorage.removeItem("m_user");
    setToken(""); setUser(null); setTab("dashboard"); setOverlay(null);
  };

  if (!isLoggedIn) {
    return (
      <PhoneFrame>
        <LoginScreen onLogin={login} />
      </PhoneFrame>
    );
  }

  // Screen content
  let screen: React.ReactNode;
  if (overlay === "payslip") {
    screen = <PayslipScreen token={token} onBack={() => setOverlay(null)} />;
  } else if (overlay === "notifications") {
    screen = <NotificationsScreen token={token} onBack={() => setOverlay(null)} />;
  } else if (overlay === "leaveApproval") {
    screen = <LeaveApprovalScreen token={token} onBack={() => setOverlay(null)} />;
  } else if (overlay === "team") {
    screen = <MyTeamScreen token={token} onBack={() => setOverlay(null)} />;
  } else if (overlay === "profile") {
    screen = <ProfileScreen token={token} user={user} onBack={() => setOverlay(null)} />;
  } else if (overlay === "advanceLoan") {
    screen = <AdvanceLoanScreen token={token} onBack={() => setOverlay(null)} />;
  } else if (tab === "dashboard") {
    screen = <DashboardTab token={token} user={user} />;
  } else if (tab === "attendance") {
    screen = <AttendanceTab token={token} />;
  } else if (tab === "leave") {
    screen = <LeaveTab token={token} />;
  } else {
    screen = <MoreTab token={token} user={user} onPayslip={() => setOverlay("payslip")} onSelect={(s) => setOverlay(s as any)} />;
  }

  return (
    <PhoneFrame>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: BG, position: "relative" }}>
        <AppBarMain user={user} unread={unread} onBell={() => setOverlay("notifications")} onLogout={logout} />
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", position: "relative" }}>
          {screen}
        </div>
        {overlay == null && <BottomNav active={tab} onSelect={t => { setTab(t); }} />}
      </div>
    </PhoneFrame>
  );
}
