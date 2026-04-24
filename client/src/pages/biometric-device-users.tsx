import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft, RefreshCw, Users, UserCheck, CreditCard, Link2,
  BadgeCheck, Pencil, Trash2, Search, Filter, SlidersHorizontal,
  AlertTriangle, CheckCircle, Clock, RotateCcw, Fingerprint,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Employee } from "@shared/schema";

/* ─── Avatar ────────────────────────────────────────────────────── */
function Avatar({ name, photo, size = "md" }: { name?: string | null; photo?: string | null; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "h-14 w-14 text-lg" : "h-9 w-9 text-sm";
  const colors = [
    "bg-blue-100 text-blue-700", "bg-green-100 text-green-700",
    "bg-purple-100 text-purple-700", "bg-orange-100 text-orange-700",
    "bg-teal-100 text-teal-700", "bg-rose-100 text-rose-700",
    "bg-indigo-100 text-indigo-700", "bg-amber-100 text-amber-700",
  ];
  const initials = name ? name.split(" ").filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join("") : "?";
  const color = name ? colors[name.charCodeAt(0) % colors.length] : "bg-muted text-muted-foreground";
  if (photo) return (
    <img src={photo.startsWith("data:") ? photo : `data:image/jpeg;base64,${photo}`} alt={name || "photo"}
      className={`${sz} rounded-full object-cover ring-2 ring-white dark:ring-gray-800 shrink-0`}
      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
  );
  return <div className={`${sz} rounded-full flex items-center justify-center font-semibold shrink-0 ${color}`}>{initials}</div>;
}

/* ─── Stat chip ─────────────────────────────────────────────────── */
function StatChip({ icon: Icon, value, label, color, active, onClick }: {
  icon: any; value: number; label: string; color: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-all text-left
        ${active ? "ring-2 ring-offset-1 ring-primary shadow-sm" : "hover:shadow-sm"}
        ${color}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <div>
        <p className="text-lg font-bold leading-none">{value}</p>
        <p className="text-[11px] opacity-70 mt-0.5">{label}</p>
      </div>
    </button>
  );
}

/* ─── User Card ─────────────────────────────────────────────────── */
function UserCard({ u, onMap, onDelete }: {
  u: any;
  onMap: (u: any) => void;
  onDelete: (u: any) => void;
}) {
  const hrName = u.matched ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : null;
  const isCardOnly = !u.enrolled && !u.deviceName;
  const cardClass = u.matched
    ? "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/20"
    : isCardOnly
      ? "border-amber-200 dark:border-amber-800 bg-amber-50/20 dark:bg-amber-950/10"
      : "bg-card";

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 transition-shadow hover:shadow-md ${cardClass}`}>
      {/* Avatar + Name */}
      <div className="flex items-center gap-3">
        <Avatar name={hrName || u.deviceName} photo={u.faceImage} size="lg" />
        <div className="flex-1 min-w-0">
          {u.deviceName
            ? <p className="font-semibold text-sm leading-tight truncate">{u.deviceName}</p>
            : hrName
              ? <p className="font-semibold text-sm leading-tight truncate">{hrName}</p>
              : <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">Card / Access PIN</p>
          }
          {u.privilege && u.privilege !== "0" && (
            <Badge variant="outline" className="text-[10px] mt-0.5">Admin</Badge>
          )}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
              PIN: {u.deviceEmployeeId}
            </span>
            {u.enrolled ? (
              <Badge className="text-[10px] h-4 px-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-0">
                Face Enrolled
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-400 text-amber-700 dark:text-amber-400">
                Card Punch
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* HR Link */}
      <div className={`rounded-lg px-3 py-2 text-xs ${u.matched
        ? "bg-green-100 dark:bg-green-900/40 border border-green-200 dark:border-green-800"
        : "bg-muted/60 border"}`}>
        {u.matched ? (
          <div className="flex items-center gap-1.5 text-green-800 dark:text-green-300">
            <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium truncate">{hrName}</p>
              {u.hrEmployeeCode && (
                <p className="opacity-70">{u.hrEmployeeCode}{u.designation ? ` · ${u.designation}` : ""}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Link2 className="h-3.5 w-3.5 shrink-0 opacity-50" />
            <span>{isCardOnly ? "Map to show HR name & photo" : "Not linked to HR employee"}</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>{u.punchCount} punch{u.punchCount !== 1 ? "es" : ""}</span>
        </div>
        {u.lastSeenAt && (
          <span className="truncate ml-2" title={u.lastSeenAt}>Last: {u.lastSeenAt.substring(0, 10)}</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          data-testid={`button-map-pin-${u.deviceEmployeeId}`}
          size="sm"
          variant={u.matched ? "outline" : "default"}
          className={`flex-1 h-8 text-xs ${isCardOnly && !u.matched ? "bg-amber-600 hover:bg-amber-700 text-white border-0" : ""}`}
          onClick={() => onMap(u)}
        >
          {u.matched
            ? <><Pencil className="h-3 w-3 mr-1.5" />Remap</>
            : <><Link2 className="h-3 w-3 mr-1.5" />Map to HR</>}
        </Button>
        <Button
          data-testid={`button-delete-user-${u.deviceEmployeeId}`}
          size="sm"
          variant="outline"
          className="h-8 w-8 p-0 text-destructive hover:bg-destructive hover:text-white border-destructive/40 shrink-0"
          title="Remove user from device"
          onClick={() => onDelete(u)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function BiometricDeviceUsersPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  /* ── Filters ────────────────────────────────────────────────────── */
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "enrolled" | "card">("all");
  const [mappingFilter, setMappingFilter] = useState<"all" | "mapped" | "unmapped">("all");
  const [activeStatChip, setActiveStatChip] = useState<string | null>(null);

  /* ── Dialogs ────────────────────────────────────────────────────── */
  const [mapPinRow, setMapPinRow] = useState<{ devicePin: string; deviceName: string } | null>(null);
  const [mapSelectedEmployee, setMapSelectedEmployee] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ pin: string; name: string } | null>(null);

  /* ── Data ───────────────────────────────────────────────────────── */
  const { data: devices = [] } = useQuery<any[]>({ queryKey: ["/api/biometric/devices"] });
  const device = (devices as any[]).find((d: any) => d.id === deviceId);

  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });

  const { data: deviceUsers, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/biometric/devices", deviceId, "users"],
    enabled: !!deviceId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/biometric/devices/${deviceId}/users`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const allUsers: any[] = deviceUsers?.users || [];

  /* ── Stats ─────────────────────────────────────────────────────── */
  const stats = useMemo(() => ({
    total: allUsers.length,
    enrolled: allUsers.filter(u => u.enrolled).length,
    card: allUsers.filter(u => !u.enrolled).length,
    mapped: allUsers.filter(u => u.matched).length,
    unmapped: allUsers.filter(u => !u.matched).length,
  }), [allUsers]);

  /* ── Filtered list ──────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = allUsers;

    // Stat chip quick filter
    if (activeStatChip === "enrolled") list = list.filter(u => u.enrolled);
    else if (activeStatChip === "card") list = list.filter(u => !u.enrolled);
    else if (activeStatChip === "mapped") list = list.filter(u => u.matched);
    else if (activeStatChip === "unmapped") list = list.filter(u => !u.matched);

    // Dropdown filters
    if (typeFilter === "enrolled") list = list.filter(u => u.enrolled);
    else if (typeFilter === "card") list = list.filter(u => !u.enrolled);

    if (mappingFilter === "mapped") list = list.filter(u => u.matched);
    else if (mappingFilter === "unmapped") list = list.filter(u => !u.matched);

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(u =>
        (u.deviceName || "").toLowerCase().includes(q) ||
        (u.deviceEmployeeId || "").toLowerCase().includes(q) ||
        (u.firstName || "").toLowerCase().includes(q) ||
        (u.lastName || "").toLowerCase().includes(q) ||
        (u.hrEmployeeCode || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [allUsers, search, typeFilter, mappingFilter, activeStatChip]);

  /* ── Mutations ──────────────────────────────────────────────────── */
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/biometric/devices/${deviceId}/sync-users`, {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Sync requested", description: data?.message || "Device will push its user list shortly." });
      setTimeout(() => refetch(), 35_000);
    },
    onError: (err: any) => toast({ title: "Sync failed", description: err?.message, variant: "destructive" }),
  });

  const mapPinMutation = useMutation({
    mutationFn: async ({ employeeId, devicePin }: { employeeId: string; devicePin: string }) => {
      const res = await apiRequest("POST", "/api/biometric/map-pin", { employeeId, devicePin, deviceId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "PIN mapped", description: "Employee linked successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/devices", deviceId, "users"] });
      // Also refresh employees (biometricDeviceId is now filled) and punch logs (employee name appears).
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/logs"] });
      setMapPinRow(null);
      setMapSelectedEmployee("");
    },
    onError: (err: any) => toast({ title: "Mapping failed", description: err?.message, variant: "destructive" }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (pin: string) => {
      const res = await apiRequest("DELETE", `/api/biometric/devices/${deviceId}/users/${pin}`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "User removed", description: data?.message });
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/devices", deviceId, "users"] });
      setDeleteConfirm(null);
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err?.message, variant: "destructive" }),
  });

  const cardOnly = allUsers.filter(u => !u.enrolled && !u.matched);

  return (
    <div className="flex flex-col min-h-full bg-background">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b px-6 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => setLocation("/biometric")}
          data-testid="button-back-biometric"
        >
          <ArrowLeft className="h-4 w-4" />
          Biometric
        </Button>
        <div className="h-4 w-px bg-border" />
        <Fingerprint className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-sm leading-none">
            {device ? `Users on ${device.name}` : "Device Users"}
          </h1>
          {device?.deviceSerial && (
            <p className="text-[11px] text-muted-foreground mt-0.5">SN: {device.deviceSerial}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          disabled={syncMutation.isPending}
          onClick={() => syncMutation.mutate()}
          data-testid="button-sync-users"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          {syncMutation.isPending ? "Syncing…" : "Sync Users"}
        </Button>
      </div>

      <div className="flex-1 p-6 space-y-5">

        {/* ── Card-only banner ───────────────────────────────────── */}
        {cardOnly.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                {cardOnly.length} card/access punch user{cardOnly.length > 1 ? "s" : ""} need{cardOnly.length === 1 ? "s" : ""} to be linked
              </p>
              <p className="mt-0.5 text-xs opacity-80">
                These PINs have punch records but are not face-enrolled on this device. Click <strong>Map to HR</strong> on each card to link them — their HR name and photo will then appear automatically.
              </p>
            </div>
          </div>
        )}

        {/* ── Stats ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatChip icon={Users} value={stats.total} label="Total Users"
            color="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
            active={activeStatChip === null}
            onClick={() => setActiveStatChip(null)} />
          <StatChip icon={UserCheck} value={stats.enrolled} label="Face Enrolled"
            color="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200"
            active={activeStatChip === "enrolled"}
            onClick={() => setActiveStatChip(activeStatChip === "enrolled" ? null : "enrolled")} />
          <StatChip icon={CreditCard} value={stats.card} label="Card Punch"
            color="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200"
            active={activeStatChip === "card"}
            onClick={() => setActiveStatChip(activeStatChip === "card" ? null : "card")} />
          <StatChip icon={BadgeCheck} value={stats.mapped} label="Mapped to HR"
            color="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200"
            active={activeStatChip === "mapped"}
            onClick={() => setActiveStatChip(activeStatChip === "mapped" ? null : "mapped")} />
        </div>

        {/* ── Filter bar ─────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              data-testid="input-search-users"
              placeholder="Search by name, PIN, employee code…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 shrink-0">
            <Select value={typeFilter} onValueChange={(v: any) => { setTypeFilter(v); setActiveStatChip(null); }}>
              <SelectTrigger className="w-40 h-9 text-sm" data-testid="select-type-filter">
                <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="enrolled">Face Enrolled</SelectItem>
                <SelectItem value="card">Card Punch</SelectItem>
              </SelectContent>
            </Select>
            <Select value={mappingFilter} onValueChange={(v: any) => { setMappingFilter(v); setActiveStatChip(null); }}>
              <SelectTrigger className="w-40 h-9 text-sm" data-testid="select-mapping-filter">
                <Filter className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All mapping</SelectItem>
                <SelectItem value="mapped">Mapped to HR</SelectItem>
                <SelectItem value="unmapped">Unmapped only</SelectItem>
              </SelectContent>
            </Select>
            {(search || typeFilter !== "all" || mappingFilter !== "all" || activeStatChip) && (
              <Button variant="ghost" size="sm" className="h-9 px-2 text-muted-foreground" onClick={() => {
                setSearch(""); setTypeFilter("all"); setMappingFilter("all"); setActiveStatChip(null);
              }}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* ── Results summary ────────────────────────────────────── */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isLoading ? (
            <span className="flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading users…</span>
          ) : (
            <>
              <span className="font-medium text-foreground">{filtered.length}</span>
              <span>of {stats.total} user{stats.total !== 1 ? "s" : ""}</span>
              {(search || typeFilter !== "all" || mappingFilter !== "all" || activeStatChip) && (
                <Badge variant="secondary" className="text-[10px]">Filtered</Badge>
              )}
            </>
          )}
        </div>

        {/* ── Grid ───────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border p-4 h-52 bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Users className="h-12 w-12 opacity-20" />
            <p className="font-medium">No users match your filters</p>
            <p className="text-sm text-center max-w-xs">
              {allUsers.length === 0
                ? "Users appear once the device pushes its enrollment list or someone punches in."
                : "Try clearing the filters to see all users."}
            </p>
            {allUsers.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => {
                setSearch(""); setTypeFilter("all"); setMappingFilter("all"); setActiveStatChip(null);
              }}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(u => (
              <UserCard
                key={u.deviceEmployeeId}
                u={u}
                onMap={u => {
                  setMapPinRow({ devicePin: u.deviceEmployeeId, deviceName: u.deviceName || u.deviceEmployeeId });
                  setMapSelectedEmployee(u.employeeId || "");
                }}
                onDelete={u => setDeleteConfirm({
                  pin: u.deviceEmployeeId,
                  name: u.deviceName || (u.matched ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : "") || `PIN ${u.deviceEmployeeId}`,
                })}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Map PIN dialog ──────────────────────────────────────────── */}
      <Dialog
        open={!!mapPinRow}
        onOpenChange={open => { if (!open) { setMapPinRow(null); setMapSelectedEmployee(""); } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Map Device PIN to Employee</DialogTitle>
            <DialogDescription>
              Link device PIN <strong className="font-mono">{mapPinRow?.devicePin}</strong>
              {mapPinRow?.deviceName && mapPinRow.deviceName !== mapPinRow.devicePin ? ` (${mapPinRow.deviceName})` : ""}
              {" "}to an HR employee. All existing punch records for this PIN will be retroactively linked.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Select value={mapSelectedEmployee} onValueChange={setMapSelectedEmployee}>
              <SelectTrigger data-testid="select-map-employee">
                <SelectValue placeholder="Select employee…" />
              </SelectTrigger>
              <SelectContent>
                {(employees as any[])
                  .filter((e: any) => !e.biometricDeviceId || e.biometricDeviceId === mapPinRow?.devicePin)
                  .map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.firstName} {e.lastName} ({e.employeeCode})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMapPinRow(null); setMapSelectedEmployee(""); }}>
              Cancel
            </Button>
            <Button
              data-testid="button-confirm-map"
              disabled={!mapSelectedEmployee || mapPinMutation.isPending}
              onClick={() => {
                if (mapPinRow && mapSelectedEmployee) {
                  mapPinMutation.mutate({ employeeId: mapSelectedEmployee, devicePin: mapPinRow.devicePin });
                }
              }}
            >
              {mapPinMutation.isPending ? "Saving…" : "Confirm Mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm dialog ──────────────────────────────────── */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={open => { if (!open) setDeleteConfirm(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Remove user from device?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This will permanently delete <strong>{deleteConfirm?.name}</strong> (PIN: {deleteConfirm?.pin}) from the biometric device.
                </p>
                <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                  <li>Their face/fingerprint enrollment will be erased from the machine.</li>
                  <li>Historical punch logs are <strong>not</strong> deleted — attendance records remain.</li>
                  <li>The delete command is queued and sent on the device's next connection.</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUserMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteUserMutation.isPending}
              onClick={() => { if (deleteConfirm) deleteUserMutation.mutate(deleteConfirm.pin); }}
            >
              {deleteUserMutation.isPending ? "Removing…" : "Remove from Device"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
