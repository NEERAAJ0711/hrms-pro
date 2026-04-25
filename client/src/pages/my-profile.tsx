import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  UserCog, Save, CheckCircle, AlertCircle, Loader2, ShieldCheck,
  MapPin, Briefcase, Banknote, Plus, Trash2, Building2, User, Phone,
  Mail, CreditCard, Landmark, Home, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { INDIAN_STATES as INDIA_STATES_LIST, INDIA_DISTRICTS } from "@/lib/india-locations";

function validateAadhaar(aadhaar: string): { valid: boolean; message: string } {
  const cleaned = aadhaar.replace(/\s/g, "");
  if (!cleaned) return { valid: false, message: "Aadhaar number is required" };
  if (!/^\d{12}$/.test(cleaned)) return { valid: false, message: "Aadhaar must be exactly 12 digits" };
  if (/^0/.test(cleaned)) return { valid: false, message: "Aadhaar cannot start with 0" };
  if (/^1/.test(cleaned)) return { valid: false, message: "Aadhaar cannot start with 1" };
  const d = cleaned.split("").map(Number);
  const vd = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
  const vp = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
  let c = 0;
  const rev = d.slice().reverse();
  for (let i = 0; i < rev.length; i++) c = vd[c][vp[i % 8][rev[i]]];
  if (c !== 0) return { valid: false, message: "Invalid Aadhaar number (checksum failed)" };
  return { valid: true, message: "Valid Aadhaar number" };
}

interface ProfileData {
  firstName: string; lastName: string; aadhaar: string; dateOfBirth: string;
  gender: string; mobileNumber: string; personalEmail: string; fatherName: string;
  address: string; addressState: string; addressDistrict: string; addressPincode: string;
  permanentAddress: string; permanentState: string; permanentDistrict: string; permanentPincode: string;
  pan: string; bankAccount: string; ifsc: string; bankName: string;
  currentSalary: string; expectedSalary: string; skills: string;
}

interface ExperienceEntry {
  id?: string; organizationName: string; postHeld: string;
  dateOfJoining: string; dateOfLeaving: string; reasonOfLeaving: string;
  ctc: string; jobResponsibilities: string;
}

const emptyExp = (): ExperienceEntry => ({
  organizationName: "", postHeld: "", dateOfJoining: "", dateOfLeaving: "",
  reasonOfLeaving: "", ctc: "", jobResponsibilities: "",
});

const StateSelect = ({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) => (
  <Select value={value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
    <SelectContent>
      {INDIA_STATES_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
    </SelectContent>
  </Select>
);

export default function MyProfilePage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [profile, setProfile] = useState<ProfileData>({
    firstName: "", lastName: "", aadhaar: "", dateOfBirth: "", gender: "",
    mobileNumber: "", personalEmail: "", fatherName: "",
    address: "", addressState: "", addressDistrict: "", addressPincode: "",
    permanentAddress: "", permanentState: "", permanentDistrict: "", permanentPincode: "",
    pan: "", bankAccount: "", ifsc: "", bankName: "",
    currentSalary: "", expectedSalary: "", skills: "",
  });

  const [sameAsPresent, setSameAsPresent] = useState(false);
  const [experiences, setExperiences] = useState<ExperienceEntry[]>([]);
  const [savedExpIds, setSavedExpIds] = useState<string[]>([]);
  const [aadhaarStatus, setAadhaarStatus] = useState<{ valid: boolean; message: string } | null>(null);
  const [aadhaarVerified, setAadhaarVerified] = useState(false);
  const [serverAadhaarCheck, setServerAadhaarCheck] = useState<any>(null);

  const { data: existingProfile, isLoading } = useQuery({ queryKey: ["/api/my-profile"] });
  const { data: savedExperiences = [] } = useQuery<any[]>({ queryKey: ["/api/my-experiences"] });
  const { data: pendingRequest, refetch: refetchPending } = useQuery<any>({
    queryKey: ["/api/my-profile/pending-request"],
    queryFn: async () => {
      const res = await fetch("/api/my-profile/pending-request", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Derived flags
  const profileData = existingProfile as any;
  const hasProfile = !!(profileData && !profileData._fromEmployee && profileData.aadhaar);
  const fromEmployee = !!(profileData?._fromEmployee);
  const aadhaarLocked = hasProfile || fromEmployee;
  const canSave = aadhaarVerified || hasProfile || fromEmployee;

  // Full display name
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");

  const handleFullNameChange = (val: string) => {
    const parts = val.trim().split(/\s+/);
    setProfile(prev => ({
      ...prev,
      firstName: parts[0] || "",
      lastName: parts.length > 1 ? parts.slice(1).join(" ") : "",
    }));
  };

  useEffect(() => {
    if (existingProfile) {
      const p = existingProfile as any;
      setProfile({
        firstName: p.firstName || user?.firstName || "",
        lastName: p.lastName || user?.lastName || "",
        aadhaar: p.aadhaar || "",
        dateOfBirth: p.dateOfBirth || "",
        gender: p.gender || "",
        mobileNumber: p.mobileNumber || "",
        personalEmail: p.personalEmail || user?.email || "",
        fatherName: p.fatherName || "",
        address: p.address || "",
        addressState: p.addressState || "",
        addressDistrict: p.addressDistrict || "",
        addressPincode: p.addressPincode || "",
        permanentAddress: p.permanentAddress || "",
        permanentState: p.permanentState || "",
        permanentDistrict: p.permanentDistrict || "",
        permanentPincode: p.permanentPincode || "",
        pan: p.pan || "",
        bankAccount: p.bankAccount || "",
        ifsc: p.ifsc || "",
        bankName: p.bankName || "",
        currentSalary: p.currentSalary || "",
        expectedSalary: p.expectedSalary || "",
        skills: p.skills || "",
      });
      if (p.aadhaar) {
        setAadhaarVerified(true);
        setAadhaarStatus({ valid: true, message: p.aadhaarPreVerified ? "Aadhaar pre-verified by admin" : "Aadhaar verified" });
      }
    } else if (user) {
      setProfile(prev => ({
        ...prev,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        personalEmail: user.email || "",
      }));
    }
  }, [existingProfile, user]);

  useEffect(() => {
    if (Array.isArray(savedExperiences) && savedExperiences.length > 0) {
      setExperiences(savedExperiences.map((e: any) => ({
        id: e.id, organizationName: e.organizationName || "", postHeld: e.postHeld || "",
        dateOfJoining: e.dateOfJoining || "", dateOfLeaving: e.dateOfLeaving || "",
        reasonOfLeaving: e.reasonOfLeaving || "", ctc: e.ctc || "",
        jobResponsibilities: e.jobResponsibilities || "",
      })));
      setSavedExpIds(savedExperiences.map((e: any) => e.id));
    }
  }, [savedExperiences]);

  // When "same as present" is checked, copy present values to permanent
  useEffect(() => {
    if (sameAsPresent) {
      setProfile(prev => ({
        ...prev,
        permanentAddress: prev.address,
        permanentState: prev.addressState,
        permanentDistrict: prev.addressDistrict,
        permanentPincode: prev.addressPincode,
      }));
    }
  }, [sameAsPresent, profile.address, profile.addressState, profile.addressDistrict, profile.addressPincode]);

  const verifyAadhaarMutation = useMutation({
    mutationFn: async (aadhaar: string) => {
      const res = await apiRequest("POST", "/api/my-profile/verify-aadhaar", { aadhaar });
      return await res.json();
    },
    onSuccess: (data: any) => {
      setServerAadhaarCheck(data);
      if (data.status === "active_exists") {
        setAadhaarVerified(false);
        toast({ title: "Aadhaar Already In Use", description: data.message, variant: "destructive" });
      } else if (data.status === "available") {
        setAadhaarVerified(true);
        toast({ title: "Aadhaar Verified", description: "Aadhaar is valid and available." });
      }
    },
    onError: (error: Error) => toast({ title: "Verification Failed", description: error.message, variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async (data: ProfileData) => {
      const res = await apiRequest("PUT", "/api/my-profile", data);
      return await res.json();
    },
    onSuccess: (data: any) => {
      if (data?.pending) {
        refetchPending();
        queryClient.invalidateQueries({ queryKey: ["/api/my-profile/pending-request"] });
        toast({ title: "Submitted for Approval", description: "Your profile update has been sent to admin for review." });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/my-profile"] });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        toast({ title: "Profile Saved", description: "Your profile has been updated successfully." });
      }
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const deleteExpMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/my-experiences/${id}`); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/my-experiences"] }),
    onError: () => toast({ title: "Error", description: "Failed to delete experience.", variant: "destructive" }),
  });

  const saveExpMutation = useMutation({
    mutationFn: async (exp: ExperienceEntry) => {
      const res = await apiRequest("POST", "/api/my-experiences", exp);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-experiences"] });
      toast({ title: "Experience Saved", description: "Work experience entry saved." });
    },
    onError: () => toast({ title: "Error", description: "Failed to save experience.", variant: "destructive" }),
  });

  const handleAadhaarChange = (value: string) => {
    const cleaned = value.replace(/[^0-9]/g, "").slice(0, 12);
    setProfile(prev => ({ ...prev, aadhaar: cleaned }));
    setAadhaarVerified(false);
    setServerAadhaarCheck(null);
    if (cleaned.length === 12) setAadhaarStatus(validateAadhaar(cleaned));
    else setAadhaarStatus(null);
  };

  const handleSave = () => {
    if (!profile.aadhaar) {
      toast({ title: "Aadhaar Required", description: "Please enter your Aadhaar number.", variant: "destructive" });
      return;
    }
    if (!aadhaarVerified && !fromEmployee) {
      toast({ title: "Aadhaar Not Verified", description: "Please verify your Aadhaar before saving.", variant: "destructive" });
      return;
    }
    if (!profile.firstName) {
      toast({ title: "Name Required", description: "Please provide your full name.", variant: "destructive" });
      return;
    }
    saveMutation.mutate(profile);
  };

  const handleChange = (field: keyof ProfileData, value: string) =>
    setProfile(prev => ({ ...prev, [field]: value }));

  const addExperience = () => setExperiences(prev => [...prev, emptyExp()]);

  const updateExp = (idx: number, field: keyof ExperienceEntry, value: string) =>
    setExperiences(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));

  const removeExp = async (idx: number) => {
    const exp = experiences[idx];
    if (exp.id && savedExpIds.includes(exp.id)) await deleteExpMutation.mutateAsync(exp.id);
    setExperiences(prev => prev.filter((_, i) => i !== idx));
  };

  const saveExp = (idx: number) => {
    const exp = experiences[idx];
    if (!exp.organizationName || !exp.postHeld || !exp.dateOfJoining || !exp.dateOfLeaving) {
      toast({ title: "Required Fields", description: "Fill organization, post, joining and leaving dates.", variant: "destructive" });
      return;
    }
    saveExpMutation.mutate(exp);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  const hasPending = !!(pendingRequest && pendingRequest.status === "pending");

  const SaveBar = () => (
    <div className="flex justify-end pt-4 border-t mt-6">
      <Button onClick={handleSave} disabled={saveMutation.isPending || !canSave || hasPending} className="px-8">
        {saveMutation.isPending
          ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</>
          : hasPending
            ? <><Clock className="h-4 w-4 mr-2" />Awaiting Approval</>
            : <><Save className="h-4 w-4 mr-2" />Save Changes</>}
      </Button>
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCog className="h-6 w-6 text-primary" /> My Profile
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {hasProfile ? "Keep your profile up to date for job applications" : "Complete your profile to apply for jobs"}
          </p>
        </div>
        {hasProfile && (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hidden sm:flex gap-1" variant="secondary">
            <CheckCircle className="h-3 w-3" /> Complete
          </Badge>
        )}
      </div>

      {hasPending && (
        <Alert className="mb-5 border-amber-300 bg-amber-50 text-amber-900">
          <Clock className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">Profile Update Pending Approval</AlertTitle>
          <AlertDescription className="text-amber-700">
            Your profile update has been submitted and is awaiting admin review. You cannot make further changes until this request is resolved.
          </AlertDescription>
        </Alert>
      )}

      {!hasProfile && !fromEmployee && !hasPending && (
        <Alert className="mb-5">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Complete Your Profile</AlertTitle>
          <AlertDescription>Verify your Aadhaar number first, then fill in all sections and save your profile.</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="personal" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 h-auto">
          <TabsTrigger value="personal" className="flex flex-col sm:flex-row gap-1 py-2.5 text-xs sm:text-sm">
            <User className="h-4 w-4" /><span>Personal</span>
          </TabsTrigger>
          <TabsTrigger value="address" className="flex flex-col sm:flex-row gap-1 py-2.5 text-xs sm:text-sm">
            <MapPin className="h-4 w-4" /><span>Address</span>
          </TabsTrigger>
          <TabsTrigger value="professional" className="flex flex-col sm:flex-row gap-1 py-2.5 text-xs sm:text-sm">
            <Briefcase className="h-4 w-4" /><span>Professional</span>
          </TabsTrigger>
          <TabsTrigger value="financial" className="flex flex-col sm:flex-row gap-1 py-2.5 text-xs sm:text-sm">
            <Banknote className="h-4 w-4" /><span>Financial</span>
          </TabsTrigger>
        </TabsList>

        {/* ── Personal Tab ─────────────────────────────────── */}
        <TabsContent value="personal" className="space-y-4">
          {/* Aadhaar Verification */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                  <ShieldCheck className="h-4 w-4 text-violet-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Aadhaar Verification</CardTitle>
                  <CardDescription className="text-xs">Required for identity verification</CardDescription>
                </div>
                {aadhaarVerified && (
                  <Badge className="ml-auto bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" variant="secondary">
                    <CheckCircle className="h-3 w-3 mr-1" /> Verified
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3 items-end">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="aadhaar">Aadhaar Number *</Label>
                  <Input
                    id="aadhaar"
                    value={profile.aadhaar}
                    onChange={(e) => handleAadhaarChange(e.target.value)}
                    placeholder="12-digit Aadhaar number"
                    maxLength={12}
                    disabled={aadhaarLocked}
                    className={`font-mono tracking-widest ${aadhaarVerified ? "border-green-400" : ""}`}
                  />
                  {aadhaarStatus && (
                    <p className={`text-xs ${aadhaarStatus.valid ? "text-green-600" : "text-red-600"}`}>
                      {aadhaarStatus.message}
                    </p>
                  )}
                  {serverAadhaarCheck?.status === "active_exists" && (
                    <p className="text-xs text-red-600">{serverAadhaarCheck.message}</p>
                  )}
                </div>
                <Button
                  onClick={() => verifyAadhaarMutation.mutate(profile.aadhaar)}
                  disabled={!aadhaarStatus?.valid || aadhaarVerified || verifyAadhaarMutation.isPending || aadhaarLocked}
                  variant={aadhaarVerified ? "outline" : "default"}
                >
                  {verifyAadhaarMutation.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : aadhaarVerified
                      ? <><CheckCircle className="h-4 w-4 mr-1 text-green-600" />Verified</>
                      : "Verify"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Personal Info */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Personal Information</CardTitle>
                  <CardDescription className="text-xs">Basic personal details</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Full Name *</Label>
                <Input
                  value={fullName}
                  onChange={(e) => handleFullNameChange(e.target.value)}
                  placeholder="Enter your full name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Father's / Husband's Name</Label>
                <Input
                  value={profile.fatherName}
                  onChange={(e) => handleChange("fatherName", e.target.value)}
                  placeholder="Father's or husband's full name"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Date of Birth</Label>
                  <Input
                    type="date"
                    value={profile.dateOfBirth}
                    onChange={(e) => handleChange("dateOfBirth", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Gender</Label>
                  <Select value={profile.gender} onValueChange={(v) => handleChange("gender", v)}>
                    <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> Mobile Number</Label>
                  <Input
                    value={profile.mobileNumber}
                    onChange={(e) => handleChange("mobileNumber", e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                    placeholder="10-digit mobile number"
                    maxLength={10}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> Personal Email</Label>
                  <Input
                    type="email"
                    value={profile.personalEmail}
                    onChange={(e) => handleChange("personalEmail", e.target.value)}
                    placeholder="Personal email address"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          <SaveBar />
        </TabsContent>

        {/* ── Address Tab ───────────────────────────────────── */}
        <TabsContent value="address" className="space-y-4">
          {/* Present Address */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                  <MapPin className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Present Address</CardTitle>
                  <CardDescription className="text-xs">Current / residential address</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>House No. / Street / Area</Label>
                <Textarea
                  value={profile.address}
                  onChange={(e) => handleChange("address", e.target.value)}
                  placeholder="e.g. C-270, Sushant Lok Phase 1, Sector 43"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>State</Label>
                  <StateSelect
                    value={profile.addressState}
                    onChange={(v) => {
                      handleChange("addressState", v);
                      handleChange("addressDistrict", "");
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>District / City</Label>
                  <Select
                    value={profile.addressDistrict}
                    onValueChange={(v) => handleChange("addressDistrict", v)}
                    disabled={!profile.addressState}
                  >
                    <SelectTrigger data-testid="select-present-district">
                      <SelectValue placeholder={profile.addressState ? "Select district/city" : "Select state first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(INDIA_DISTRICTS[profile.addressState] || []).map(d => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Pincode</Label>
                  <Input
                    value={profile.addressPincode}
                    onChange={(e) => handleChange("addressPincode", e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                    placeholder="6-digit pincode"
                    maxLength={6}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Permanent Address */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <Home className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Permanent Address</CardTitle>
                    <CardDescription className="text-xs">Permanent / native place address</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="same-as-present"
                    checked={sameAsPresent}
                    onCheckedChange={(v) => setSameAsPresent(!!v)}
                  />
                  <label htmlFor="same-as-present" className="text-xs text-muted-foreground cursor-pointer">
                    Same as present
                  </label>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>House No. / Street / Area</Label>
                <Textarea
                  value={profile.permanentAddress}
                  onChange={(e) => { setSameAsPresent(false); handleChange("permanentAddress", e.target.value); }}
                  placeholder="e.g. Village Rampur, Tehsil Solan"
                  rows={2}
                  disabled={sameAsPresent}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>State</Label>
                  <StateSelect
                    value={profile.permanentState}
                    disabled={sameAsPresent}
                    onChange={(v) => {
                      setSameAsPresent(false);
                      handleChange("permanentState", v);
                      handleChange("permanentDistrict", "");
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>District / City</Label>
                  <Select
                    value={profile.permanentDistrict}
                    onValueChange={(v) => { setSameAsPresent(false); handleChange("permanentDistrict", v); }}
                    disabled={sameAsPresent || !profile.permanentState}
                  >
                    <SelectTrigger data-testid="select-permanent-district">
                      <SelectValue placeholder={profile.permanentState ? "Select district/city" : "Select state first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(INDIA_DISTRICTS[profile.permanentState] || []).map(d => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Pincode</Label>
                  <Input
                    value={profile.permanentPincode}
                    onChange={(e) => { setSameAsPresent(false); handleChange("permanentPincode", e.target.value.replace(/[^0-9]/g, "").slice(0, 6)); }}
                    placeholder="6-digit pincode"
                    maxLength={6}
                    disabled={sameAsPresent}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          <SaveBar />
        </TabsContent>

        {/* ── Professional Tab ──────────────────────────────── */}
        <TabsContent value="professional" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/30">
                  <Briefcase className="h-4 w-4 text-teal-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Salary & Skills</CardTitle>
                  <CardDescription className="text-xs">Salary expectations and key skills</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Current / Last Salary (Annual CTC)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                    <Input className="pl-7" value={profile.currentSalary} onChange={(e) => handleChange("currentSalary", e.target.value)} placeholder="e.g. 450000" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Expected Salary (Annual CTC)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                    <Input className="pl-7" value={profile.expectedSalary} onChange={(e) => handleChange("expectedSalary", e.target.value)} placeholder="e.g. 600000" />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Key Skills</Label>
                <Textarea
                  value={profile.skills}
                  onChange={(e) => handleChange("skills", e.target.value)}
                  placeholder="e.g. HR Management, Payroll, Recruitment, MS Office..."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">Comma-separated list of your top skills</p>
              </div>
            </CardContent>
          </Card>

          {/* Work Experience */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-pink-100 dark:bg-pink-900/30">
                    <Building2 className="h-4 w-4 text-pink-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Work Experience</CardTitle>
                    <CardDescription className="text-xs">Previous employment history</CardDescription>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={addExperience} className="border-pink-300 text-pink-700 hover:bg-pink-50 dark:border-pink-700 dark:text-pink-400">
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {experiences.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No work experience added yet</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={addExperience}>
                    <Plus className="h-4 w-4 mr-1" /> Add Experience
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {experiences.map((exp, idx) => (
                    <div key={idx} className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-semibold">{exp.organizationName || `Experience ${idx + 1}`}</span>
                          {exp.id && <Badge variant="secondary" className="text-xs">Saved</Badge>}
                        </div>
                        <div className="flex gap-2">
                          {!exp.id && (
                            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => saveExp(idx)} disabled={saveExpMutation.isPending}>
                              {saveExpMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />} Save
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 h-7 w-7 p-0" onClick={() => removeExp(idx)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Organization Name *</Label>
                          <Input value={exp.organizationName} onChange={(e) => updateExp(idx, "organizationName", e.target.value)} placeholder="Company / Organization" className="h-9 text-sm" disabled={!!exp.id} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Designation / Post *</Label>
                          <Input value={exp.postHeld} onChange={(e) => updateExp(idx, "postHeld", e.target.value)} placeholder="Role / Designation" className="h-9 text-sm" disabled={!!exp.id} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Date of Joining *</Label>
                          <Input type="date" value={exp.dateOfJoining} onChange={(e) => updateExp(idx, "dateOfJoining", e.target.value)} className="h-9 text-sm" disabled={!!exp.id} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Date of Leaving *</Label>
                          <Input type="date" value={exp.dateOfLeaving} onChange={(e) => updateExp(idx, "dateOfLeaving", e.target.value)} className="h-9 text-sm" disabled={!!exp.id} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Last CTC / Salary (Annual)</Label>
                          <Input value={exp.ctc} onChange={(e) => updateExp(idx, "ctc", e.target.value)} placeholder="e.g. 360000" className="h-9 text-sm" disabled={!!exp.id} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Reason of Leaving</Label>
                          <Input value={exp.reasonOfLeaving} onChange={(e) => updateExp(idx, "reasonOfLeaving", e.target.value)} placeholder="Better opportunity, etc." className="h-9 text-sm" disabled={!!exp.id} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Job Responsibilities</Label>
                        <Textarea value={exp.jobResponsibilities} onChange={(e) => updateExp(idx, "jobResponsibilities", e.target.value)} placeholder="Key responsibilities and achievements..." rows={2} className="text-sm" disabled={!!exp.id} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <SaveBar />
        </TabsContent>

        {/* ── Financial Tab ─────────────────────────────────── */}
        <TabsContent value="financial" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                  <CreditCard className="h-4 w-4 text-yellow-600" />
                </div>
                <div>
                  <CardTitle className="text-base">PAN Card</CardTitle>
                  <CardDescription className="text-xs">Permanent Account Number for tax purposes</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                <Label>PAN Number</Label>
                <Input
                  value={profile.pan}
                  onChange={(e) => handleChange("pan", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  className="uppercase font-mono tracking-widest"
                />
                <p className="text-xs text-muted-foreground">Format: 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F)</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <Landmark className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Bank Account Details</CardTitle>
                  <CardDescription className="text-xs">For salary and payment processing</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Bank Name</Label>
                <Input value={profile.bankName} onChange={(e) => handleChange("bankName", e.target.value)} placeholder="e.g. State Bank of India" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Account Number</Label>
                  <Input value={profile.bankAccount} onChange={(e) => handleChange("bankAccount", e.target.value.replace(/[^0-9]/g, ""))} placeholder="Bank account number" className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>IFSC Code</Label>
                  <Input value={profile.ifsc} onChange={(e) => handleChange("ifsc", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))} placeholder="e.g. SBIN0001234" maxLength={11} className="uppercase font-mono tracking-widest" />
                  <p className="text-xs text-muted-foreground">11-character IFSC code</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <SaveBar />
        </TabsContent>
      </Tabs>
    </div>
  );
}
