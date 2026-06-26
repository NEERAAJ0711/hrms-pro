import { useReports } from "@/lib/reports/use-reports";
import { ViewReportDialog } from "@/components/reports/view-report-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Calendar, CreditCard, Shield, TrendingUp, UserRound, FilePen, Building2 } from "lucide-react";

export default function ReportsPage() {
  const {
    hasAccess,
    user,
    isSuperAdmin,
    activeTab,
    setActiveTab,
    selectedCompany,
    setSelectedCompany,
    selectedMonth,
    setSelectedMonth,
    selectedYear,
    setSelectedYear,
    yearType,
    setYearType,
    customFromMonth,
    setCustomFromMonth,
    customToMonth,
    setCustomToMonth,
    docEmployee,
    setDocEmployee,
    selectedDate,
    setSelectedDate,
    contractorPrincipalId,
    setContractorPrincipalId,
    selectedContractorId,
    setSelectedContractorId,
    dwDept,
    setDwDept,
    dwDesig,
    setDwDesig,
    dwLoc,
    setDwLoc,
    dwCont,
    setDwCont,
    dwSubtotalBy,
    setDwSubtotalBy,
    empSearchQuery,
    setEmpSearchQuery,
    empSearchOpen,
    setEmpSearchOpen,
    viewDialogOpen,
    setViewDialogOpen,
    viewTitle,
    viewHeaders,
    viewRows,
    sortCol,
    setSortCol,
    sortDir,
    setSortDir,
    companies,
    contractorMastersList,
    companyContractors,
    contractorTaggedEmpList,
    filteredEmployees,
    baseEmployees,
    globalDepts,
    globalDesigs,
    globalLocs,
    globalContractors,
    attendanceReports,
    payrollReports,
    statutoryReports,
    annualReports,
    employeeReports,
    hrDocReports,
    contractorCards,
    sidebarCategories,
    reportsByCategory,
    renderEnhancedCard,
    renderSection,
  } = useReports();

  if (!hasAccess) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You do not have permission to access the Reports module.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex gap-0 min-h-full" data-testid="reports-page">

      {/* ── Left Category Sidebar ── */}
      <div className="w-56 shrink-0 border-r bg-muted/10">
        <div className="sticky top-0 p-3 space-y-0.5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">Categories</p>
          {sidebarCategories.map(cat => {
            const isActive = activeTab === cat.id;
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                data-testid={`category-${cat.id}`}
                onClick={() => setActiveTab(cat.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 group ${
                  isActive
                    ? `${cat.activeBg} font-semibold ${cat.color}`
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? cat.color : "group-hover:text-foreground"}`} />
                <span className="flex-1 text-left text-xs leading-tight">{cat.label}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/40 dark:bg-black/20" : "bg-muted text-muted-foreground"}`}>
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 min-w-0 p-6">

        {/* ── Page header (filters now live on each report line) ── */}
        <div className="mb-5 flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight truncate">{sidebarCategories.find(c => c.id === activeTab)?.label ?? "Reports"}</h1>
            <p className="text-xs text-muted-foreground">Use the filter icon on each report to set its options, then download Excel or PDF.</p>
          </div>
        </div>

        {/* Contractor selection — required for the Contractor Reports tab only */}
        {activeTab === "contractor" && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border bg-background shadow-sm p-3">
            <span className="text-xs font-semibold text-primary">Contractor Reports:</span>
            {isSuperAdmin && (
              <div className="flex items-center gap-1.5">
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold shrink-0">1</span>
                <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Principal Co.:</label>
                <Select value={contractorPrincipalId || "__none__"} onValueChange={v => { const val = v === "__none__" ? "" : v; setContractorPrincipalId(val); setSelectedContractorId(""); setSelectedCompany(""); }}>
                  <SelectTrigger className="h-8 w-48 text-xs" data-testid="contractor-principal"><SelectValue placeholder="Select company…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Select Principal Company —</SelectItem>
                    {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              {isSuperAdmin && <span className={`flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold shrink-0 ${contractorPrincipalId ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>2</span>}
              <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Contractor:</label>
              <Select value={selectedContractorId || "__none__"} onValueChange={v => { const val = v === "__none__" ? "" : v; setSelectedContractorId(val); setSelectedCompany(val); }} disabled={!contractorPrincipalId}>
                <SelectTrigger className="h-8 w-48 text-xs" data-testid="contractor-select"><SelectValue placeholder={companyContractors.length === 0 ? "No contractors mapped" : "Select contractor…"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— All Contractors —</SelectItem>
                  {companyContractors.map(c => <SelectItem key={c.contractorId} value={c.contractorId}>{c.contractorName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* ── Reports Content ── */}

        {/* All Reports — sections view */}
        {activeTab === "all" && (
          <div>
            {renderSection("Attendance & Time", Calendar, "text-blue-600", "bg-blue-50 dark:bg-blue-950", attendanceReports)}
            {renderSection("Payroll & Salary", CreditCard, "text-green-600", "bg-green-50 dark:bg-green-950", payrollReports,
              "Pay Slip uses the selected employee filter above. Leave blank for all employees."
            )}
            {renderSection("Statutory Compliance", Shield, "text-purple-600", "bg-purple-50 dark:bg-purple-950", statutoryReports)}
            {renderSection("Annual Reports", TrendingUp, "text-amber-600", "bg-amber-50 dark:bg-amber-950", annualReports)}
            {renderSection("Employee Records", UserRound, "text-teal-600", "bg-teal-50 dark:bg-teal-950", employeeReports)}
            {renderSection("HR Documents", FilePen, "text-sky-600", "bg-sky-50 dark:bg-sky-950", hrDocReports,
              "Select an employee above before generating Offer Letter or Appointment Letter."
            )}
            {renderSection("Contractor Reports", Building2, "text-rose-600", "bg-rose-50 dark:bg-rose-950", contractorCards as typeof attendanceReports)}
          </div>
        )}

        {/* Single-category grid views */}
        {activeTab !== "all" && activeTab !== "contractor" && (() => {
          const activeReports = reportsByCategory[activeTab] ?? [];
          if (activeReports.length === 0) return (
            <div className="text-center py-20 text-muted-foreground">
              <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-25" />
              <p className="font-medium">No reports in this category</p>
            </div>
          );
          const noteMap: Record<string, string> = {
            payroll:  "Pay Slip uses the selected Employee filter. Leave blank to generate for all employees.",
            hr:       "Select an Employee above before generating Offer Letter or Appointment Letter.",
            employee: "Employee filter narrows results for individual reports like Personal File and Individual Attendance.",
          };
          return (
            <>
              {noteMap[activeTab] && (
                <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 mb-4">
                  {noteMap[activeTab]}
                </p>
              )}
              <div className="space-y-2">
                {activeReports.map(r => renderEnhancedCard(r))}
              </div>
            </>
          );
        })()}

        {/* Contractor category */}
        {activeTab === "contractor" && (
          !contractorPrincipalId ? (
            <div className="text-center py-20 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-25" />
              <p className="font-semibold text-base">Select a Principal Company to get started</p>
              <p className="text-sm mt-1">Then choose a contractor mapped to that company to view compliance reports.</p>
            </div>
          ) : companyContractors.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-25" />
              <p className="font-semibold text-base">No contractors mapped to this company</p>
              <p className="text-sm mt-1">Go to Company settings and add contractor companies first.</p>
            </div>
          ) : (
            <>
              {selectedContractorId && (
                <p className="text-xs text-muted-foreground bg-muted/40 border rounded-lg px-3 py-2 mb-4">
                  Showing <span className="font-semibold text-foreground">{contractorTaggedEmpList.length}</span> employee(s) for contractor: <span className="font-semibold text-foreground">{companyContractors.find(c => c.contractorId === selectedContractorId)?.contractorName}</span>
                </p>
              )}
              <div className="space-y-2">
                {contractorCards.map(r => renderEnhancedCard(r))}
              </div>
            </>
          )
        )}
      </div>

      <ViewReportDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        title={viewTitle}
        headers={viewHeaders}
        rows={viewRows}
        sortCol={sortCol}
        setSortCol={setSortCol}
        sortDir={sortDir}
        setSortDir={setSortDir}
      />
    </div>
  );
}