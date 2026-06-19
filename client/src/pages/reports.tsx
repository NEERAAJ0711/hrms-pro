import { useReports } from "@/lib/reports/use-reports";
import { ViewReportDialog } from "@/components/reports/view-report-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Calendar, CreditCard, Shield, TrendingUp, UserRound, FilePen, Building2, Filter, X } from "lucide-react";

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

        {/* Page header */}
        <div className="flex items-center gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              {sidebarCategories.find(c => c.id === activeTab)?.label ?? "Reports"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Generate and download reports in Excel and PDF format</p>
          </div>
        </div>

        {/* ── Global Filter Panel ── */}
        {(() => {
          const hasActiveFilter = (isSuperAdmin && selectedCompany && selectedCompany !== "__all__") || dwDept || dwDesig || dwLoc || dwCont || docEmployee;
          const selectedEmpObj = filteredEmployees.find(e => e.id === docEmployee) ?? baseEmployees.find(e => e.id === docEmployee);
          const empLabel = selectedEmpObj ? `${selectedEmpObj.firstName} ${selectedEmpObj.lastName} (${selectedEmpObj.employeeCode})` : "";
          const empMatches = baseEmployees.filter(e => {
            const q = empSearchQuery.toLowerCase();
            return !q || `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q);
          });
          return (
            <div className="mb-5 rounded-xl border bg-background shadow-sm overflow-hidden">
              {/* Panel header */}
              <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/40">
                <Filter className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Report Filters</span>
                {hasActiveFilter && (
                  <button
                    onClick={() => { setSelectedCompany(isSuperAdmin ? "" : (user?.companyId || "")); setDwDept(""); setDwDesig(""); setDwLoc(""); setDwCont(""); setDocEmployee(""); }}
                    className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                    data-testid="clear-all-filters"
                  >
                    <X className="h-3 w-3" />Clear filters
                  </button>
                )}
              </div>

              <div className="p-3 space-y-2.5">
                {/* Row 1: Company | Month | Date */}
                <div className="flex flex-wrap items-center gap-3">
                  {isSuperAdmin && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Company:</label>
                      <Select value={selectedCompany || "__all__"} onValueChange={setSelectedCompany}>
                        <SelectTrigger className="h-8 w-48 text-xs" data-testid="filter-company"><SelectValue placeholder="All Companies" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All Companies</SelectItem>
                          {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Month:</label>
                    <Input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="h-8 w-36 text-xs" data-testid="filter-month" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Date:</label>
                    <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="h-8 w-36 text-xs" data-testid="filter-date" />
                  </div>
                </div>

                {/* Row 2: Year type toggle | Year/Custom range | Employee search */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1 rounded-md border bg-muted/40 p-0.5">
                    {(["calendar", "financial", "custom"] as const).map(t => (
                      <button key={t} onClick={() => setYearType(t)}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${yearType === t ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                        {t === "calendar" ? "Calendar Year" : t === "financial" ? "Financial Year" : "Custom"}
                      </button>
                    ))}
                  </div>
                  {yearType === "calendar" && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Year:</label>
                      <Input type="number" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="h-8 w-20 text-xs" min={2020} max={2099} data-testid="filter-year" />
                    </div>
                  )}
                  {yearType === "financial" && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">FY:</label>
                      <Input type="number" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="h-8 w-20 text-xs" min={2020} max={2099} />
                      <span className="text-xs text-muted-foreground">→ {selectedYear}-{String(parseInt(selectedYear) + 1).slice(-2)}</span>
                    </div>
                  )}
                  {yearType === "custom" && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">From:</label>
                      <Input type="month" value={customFromMonth} onChange={e => setCustomFromMonth(e.target.value)} className="h-8 w-32 text-xs" />
                      <label className="text-xs font-medium text-muted-foreground">To:</label>
                      <Input type="month" value={customToMonth} onChange={e => setCustomToMonth(e.target.value)} className="h-8 w-32 text-xs" />
                    </div>
                  )}
                  {/* Employee search */}
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Employee:</label>
                    <div className="relative">
                      <Input
                        data-testid="emp-search-input"
                        placeholder="Search employee…"
                        className="h-8 w-52 text-xs"
                        value={empSearchOpen ? empSearchQuery : empLabel}
                        onFocus={() => { setEmpSearchOpen(true); setEmpSearchQuery(""); }}
                        onChange={e => setEmpSearchQuery(e.target.value)}
                        onBlur={() => setTimeout(() => setEmpSearchOpen(false), 150)}
                        autoComplete="off"
                      />
                      {empSearchOpen && (
                        <div className="absolute z-50 w-64 mt-1 bg-popover border rounded-md shadow-lg max-h-52 overflow-y-auto">
                          <div className="cursor-pointer px-3 py-1.5 text-xs hover:bg-accent text-muted-foreground" onMouseDown={() => { setDocEmployee(""); setEmpSearchOpen(false); setEmpSearchQuery(""); }}>All Employees</div>
                          {empMatches.map(e => (
                            <div key={e.id} className={`cursor-pointer px-3 py-1.5 text-xs hover:bg-accent flex items-center justify-between ${docEmployee === e.id ? "bg-accent/60 font-medium" : ""}`}
                              onMouseDown={() => { setDocEmployee(e.id); setEmpSearchOpen(false); setEmpSearchQuery(""); }}>
                              <span>{e.firstName} {e.lastName}</span>
                              <span className="text-[10px] text-muted-foreground ml-2">{e.employeeCode}</span>
                            </div>
                          ))}
                          {empMatches.length === 0 && <div className="px-3 py-1.5 text-xs text-muted-foreground">No employees found</div>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Row 3: Department | Designation | Location | Contractor | Subtotal By */}
                <div className="flex flex-wrap items-center gap-3">
                  {globalDepts.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Dept:</label>
                      <Select value={dwDept || "__all__"} onValueChange={v => setDwDept(v === "__all__" ? "" : v)}>
                        <SelectTrigger className="h-8 w-36 text-xs" data-testid="filter-dw-dept"><SelectValue placeholder="All Depts" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All Departments</SelectItem>
                          {globalDepts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {globalDesigs.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Designation:</label>
                      <Select value={dwDesig || "__all__"} onValueChange={v => setDwDesig(v === "__all__" ? "" : v)}>
                        <SelectTrigger className="h-8 w-36 text-xs" data-testid="filter-dw-desig"><SelectValue placeholder="All Desigs" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All Designations</SelectItem>
                          {globalDesigs.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {globalLocs.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Location:</label>
                      <Select value={dwLoc || "__all__"} onValueChange={v => setDwLoc(v === "__all__" ? "" : v)}>
                        <SelectTrigger className="h-8 w-36 text-xs" data-testid="filter-dw-loc"><SelectValue placeholder="All Locations" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All Locations</SelectItem>
                          {globalLocs.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {contractorMastersList.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Contractor:</label>
                      <Select value={dwCont || "__all__"} onValueChange={v => setDwCont(v === "__all__" ? "" : v)}>
                        <SelectTrigger className="h-8 w-40 text-xs" data-testid="filter-dw-cont"><SelectValue placeholder="All Contractors" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All Contractors</SelectItem>
                          {globalContractors.map(c => <SelectItem key={c.id} value={c.id}>{c.contractorName}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Subtotal By:</label>
                    <Select value={dwSubtotalBy} onValueChange={setDwSubtotalBy}>
                      <SelectTrigger className="h-8 w-36 text-xs" data-testid="filter-dw-subtotal-by"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="department">Department</SelectItem>
                        <SelectItem value="designation">Designation</SelectItem>
                        <SelectItem value="location">Location</SelectItem>
                        <SelectItem value="contractor">Contractor</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Row 4: Contractor tab — principal + contractor selection */}
                {activeTab === "contractor" && (
                  <div className="flex flex-wrap items-center gap-3 pt-2.5 border-t">
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
              </div>
            </div>
          );
        })()}

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
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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