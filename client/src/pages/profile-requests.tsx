import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ClipboardCheck, Clock, CheckCircle2, XCircle, ChevronDown, ChevronUp, User, Calendar, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";

interface ProfileData {
  firstName?: string; lastName?: string; aadhaar?: string; dateOfBirth?: string;
  gender?: string; mobileNumber?: string; personalEmail?: string; fatherName?: string;
  address?: string; addressState?: string; addressDistrict?: string; addressPincode?: string;
  permanentAddress?: string; permanentState?: string; permanentDistrict?: string; permanentPincode?: string;
  pan?: string; bankAccount?: string; ifsc?: string; bankName?: string;
  currentSalary?: string; expectedSalary?: string; skills?: string;
}

interface ProfileRequest {
  id: string;
  userId: string;
  companyId: string | null;
  status: string;
  requestData: string;
  adminNote: string | null;
  reviewedBy: string | null;
  createdAt: string;
  reviewedAt: string | null;
  userName: string;
  userEmail: string;
  currentData: ProfileData | null;
}

const STATUS_BADGE: Record<string, JSX.Element> = {
  pending: <Badge className="bg-amber-100 text-amber-800 border-amber-200 border">Pending</Badge>,
  approved: <Badge className="bg-green-100 text-green-800 border-green-200 border">Approved</Badge>,
  rejected: <Badge className="bg-red-100 text-red-800 border-red-200 border">Rejected</Badge>,
  cancelled: <Badge className="bg-gray-100 text-gray-600 border-gray-200 border">Cancelled</Badge>,
};

const FIELD_LABELS: Record<string, string> = {
  fullName: "Full Name", aadhaar: "Aadhaar",
  dateOfBirth: "Date of Birth", gender: "Gender", mobileNumber: "Mobile",
  personalEmail: "Personal Email", fatherName: "Father Name",
  address: "Present Address", addressState: "Present State",
  addressDistrict: "Present District", addressPincode: "Present Pincode",
  permanentAddress: "Permanent Address", permanentState: "Permanent State",
  permanentDistrict: "Permanent District", permanentPincode: "Permanent Pincode",
  pan: "PAN", bankAccount: "Bank Account", ifsc: "IFSC", bankName: "Bank Name",
  currentSalary: "Current Salary", expectedSalary: "Expected Salary", skills: "Skills",
};

const FIELD_ORDER = [
  "fullName", "aadhaar", "dateOfBirth", "gender", "mobileNumber",
  "personalEmail", "fatherName", "address", "addressState", "addressDistrict", "addressPincode",
  "permanentAddress", "permanentState", "permanentDistrict", "permanentPincode",
  "pan", "bankAccount", "ifsc", "bankName", "currentSalary", "expectedSalary", "skills",
];

function getFieldValue(data: ProfileData, key: string): string {
  if (key === "fullName") {
    return [data.firstName, data.lastName].filter(Boolean).join(" ").trim();
  }
  return String(data[key as keyof ProfileData] || "");
}

function DiffTable({ newData, currentData }: { newData: ProfileData; currentData: ProfileData | null }) {
  const rows = FIELD_ORDER.map(key => {
    const newVal = getFieldValue(newData, key);
    const oldVal = currentData ? getFieldValue(currentData, key) : "";
    const changed = newVal !== oldVal;
    const hasContent = newVal || oldVal;
    if (!hasContent) return null;
    return { key, label: FIELD_LABELS[key] ?? key, oldVal, newVal, changed };
  }).filter(Boolean) as { key: string; label: string; oldVal: string; newVal: string; changed: boolean }[];

  const changedRows = rows.filter(r => r.changed);
  const unchangedRows = rows.filter(r => !r.changed);

  if (currentData === null) {
    return (
      <div>
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">New Profile Submission</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {rows.filter(r => r.newVal).map(r => (
            <div key={r.key} className="flex gap-2">
              <span className="text-gray-500 shrink-0 min-w-[130px]">{r.label}:</span>
              <span className="text-gray-900 font-medium break-all">{r.newVal}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {changedRows.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
            {changedRows.length} Field{changedRows.length > 1 ? "s" : ""} Changed
          </p>
          <div className="rounded-lg overflow-hidden border border-amber-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-50 border-b border-amber-200">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-amber-800 w-[130px]">Field</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Current Value</th>
                  <th className="w-6 px-1 py-2 text-center">
                    <ArrowRight className="h-3 w-3 text-amber-500 mx-auto" />
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-green-700">New Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {changedRows.map(r => (
                  <tr key={r.key} className="bg-white hover:bg-amber-50/40">
                    <td className="px-3 py-2 text-gray-500 font-medium text-xs">{r.label}</td>
                    <td className="px-3 py-2 text-gray-400 line-through break-all">{r.oldVal || "—"}</td>
                    <td className="w-6 px-1 py-2 text-center">
                      <ArrowRight className="h-3 w-3 text-amber-400 mx-auto" />
                    </td>
                    <td className="px-3 py-2 text-green-800 font-semibold break-all">{r.newVal || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {changedRows.length === 0 && (
        <p className="text-sm text-gray-400 italic">No fields changed from current profile.</p>
      )}

      {unchangedRows.length > 0 && changedRows.length > 0 && (
        <details className="group">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 list-none flex items-center gap-1">
            <ChevronDown className="h-3 w-3 group-open:rotate-180 transition-transform" />
            {unchangedRows.length} unchanged field{unchangedRows.length > 1 ? "s" : ""}
          </summary>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm pl-4">
            {unchangedRows.filter(r => r.newVal).map(r => (
              <div key={r.key} className="flex gap-2">
                <span className="text-gray-400 shrink-0 min-w-[130px]">{r.label}:</span>
                <span className="text-gray-500 break-all">{r.newVal}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function RequestCard({ request }: { request: ProfileRequest }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(request.status === "pending");
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);

  const newData: ProfileData = (() => {
    try { return JSON.parse(request.requestData); }
    catch { return {}; }
  })();

  const approveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/profile-update-requests/${request.id}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/profile-update-requests"] });
      toast({ title: "Approved", description: "Profile update has been applied successfully." });
    },
    onError: () => toast({ title: "Error", description: "Failed to approve request.", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/profile-update-requests/${request.id}/reject`, { adminNote: rejectNote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/profile-update-requests"] });
      toast({ title: "Rejected", description: "Profile update request has been rejected." });
      setShowRejectBox(false);
    },
    onError: () => toast({ title: "Error", description: "Failed to reject request.", variant: "destructive" }),
  });

  const displayName = request.userName && !request.userName.match(/^[0-9a-f-]{36}$/)
    ? request.userName
    : [newData.firstName, newData.lastName].filter(Boolean).join(" ") || request.userName;

  return (
    <Card className={`border ${request.status === "pending" ? "border-amber-200 bg-amber-50/20" : "border-gray-200"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{displayName || "Unknown User"}</p>
              <p className="text-xs text-gray-500">{request.userEmail || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {STATUS_BADGE[request.status] ?? <Badge variant="outline">{request.status}</Badge>}
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
            </span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpanded(p => !p)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <Separator className="mb-4" />
          <DiffTable newData={newData} currentData={request.currentData} />

          {request.adminNote && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              <strong>Admin Note:</strong> {request.adminNote}
            </div>
          )}

          {request.status === "pending" && (
            <div className="mt-4 flex flex-col gap-3">
              {showRejectBox ? (
                <div className="space-y-2">
                  <Label className="text-sm">Rejection reason (optional)</Label>
                  <Textarea
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    placeholder="Provide a reason for rejection..."
                    rows={2}
                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive"
                      onClick={() => rejectMutation.mutate()}
                      disabled={rejectMutation.isPending}>
                      {rejectMutation.isPending ? "Rejecting..." : "Confirm Reject"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowRejectBox(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => approveMutation.mutate()}
                    disabled={approveMutation.isPending}>
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    {approveMutation.isPending ? "Approving..." : "Approve"}
                  </Button>
                  <Button size="sm" variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => setShowRejectBox(true)}>
                    <XCircle className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function ProfileRequestsPage() {
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  const { data: requests = [], isLoading } = useQuery<ProfileRequest[]>({
    queryKey: ["/api/admin/profile-update-requests"],
    queryFn: async () => {
      const res = await fetch("/api/admin/profile-update-requests", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load requests");
      return res.json();
    },
  });

  const filtered = filter === "all" ? requests : requests.filter(r => r.status === filter);
  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
          <ClipboardCheck className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profile Update Requests</h1>
          <p className="text-sm text-gray-500">Review and approve employee profile update submissions</p>
        </div>
        {pendingCount > 0 && (
          <Badge className="ml-auto bg-amber-500 text-white text-sm px-3 py-1">
            <Clock className="h-3 w-3 mr-1" /> {pendingCount} Pending
          </Badge>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["pending", "approved", "rejected", "all"] as const).map(f => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f === "all" ? "All Requests" : f}
            {f === "pending" && pendingCount > 0 && (
              <span className="ml-1.5 bg-white text-amber-700 text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
                {pendingCount}
              </span>
            )}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading requests...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardCheck className="h-12 w-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            {filter === "pending" ? "No pending profile update requests." : "No requests found."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => <RequestCard key={r.id} request={r} />)}
        </div>
      )}
    </div>
  );
}
