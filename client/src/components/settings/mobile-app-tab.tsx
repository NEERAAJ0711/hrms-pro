import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Settings, Building2, Calendar, CalendarDays, Clock, Bell, Shield, Save, Users, Briefcase, MapPin, DollarSign, Percent, Plus, Pencil, Trash2, FileText, LocateFixed, Loader2, Smartphone, Upload, CheckCircle2, AlertTriangle, KeyRound, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/hooks/use-can";
import type { Company, Setting, MasterDepartment, MasterDesignation, MasterLocation, EarningHead, DeductionHead, StatutorySettings, TimeOfficePolicy, Holiday, WageGrade, ContractorMaster, LeavePolicy } from "@shared/schema";
import { Textarea } from "@/components/ui/textarea";

export function MobileAppVersionTab() {
  const { toast } = useToast();
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [form, setForm] = useState({ version: "", buildNumber: "", releaseNotes: "", mandatory: false, downloadUrl: "" });
  const [uploading, setUploading] = useState(false);

  const { data: current, refetch } = useQuery<any>({
    queryKey: ["/api/admin/app-version"],
  });

  useEffect(() => {
    if (current) {
      setForm({
        version: current.version || "",
        buildNumber: String(current.buildNumber || ""),
        releaseNotes: current.releaseNotes || "",
        mandatory: current.mandatory || false,
        downloadUrl: current.downloadUrl || "",
      });
    }
  }, [current]);

  const handleSave = async () => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("version", form.version);
      fd.append("buildNumber", form.buildNumber);
      fd.append("releaseNotes", form.releaseNotes);
      fd.append("mandatory", String(form.mandatory));
      fd.append("downloadUrl", form.downloadUrl);
      if (apkFile) fd.append("apk", apkFile);
      const res = await fetch("/api/admin/app-version", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Failed");
      await refetch();
      setApkFile(null);
      toast({ title: "App version updated", description: "Mobile app update info saved successfully." });
    } catch {
      toast({ title: "Error", description: "Failed to save app version.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const apkHosted = current?.downloadUrl?.startsWith("/uploads/");

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" /> Current Published Version</CardTitle>
          <CardDescription>What employees see when the app checks for updates</CardDescription>
        </CardHeader>
        <CardContent>
          {current ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-muted rounded-lg text-center">
                <div className="text-2xl font-bold">{current.version || "—"}</div>
                <div className="text-xs text-muted-foreground mt-1">Version</div>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <div className="text-2xl font-bold">{current.buildNumber || "—"}</div>
                <div className="text-xs text-muted-foreground mt-1">Build Number</div>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <div className={`text-2xl font-bold ${current.mandatory ? "text-destructive" : "text-green-600"}`}>
                  {current.mandatory ? "Yes" : "No"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Mandatory Update</div>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                {apkHosted ? (
                  <div className="flex flex-col items-center gap-1">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <div className="text-xs text-muted-foreground">APK Hosted</div>
                  </div>
                ) : current.downloadUrl ? (
                  <div className="flex flex-col items-center gap-1">
                    <CheckCircle2 className="h-6 w-6 text-blue-600" />
                    <div className="text-xs text-muted-foreground">External URL</div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <AlertTriangle className="h-6 w-6 text-amber-500" />
                    <div className="text-xs text-muted-foreground">No Download URL</div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground text-sm">No version published yet.</div>
          )}
          {current?.releaseNotes && (
            <div className="mt-4 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
              <strong>Release Notes:</strong> {current.releaseNotes}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Publish New Version</CardTitle>
          <CardDescription>
            Upload a new APK or provide an external link. Employees will be prompted to update when the build number is higher than their installed build.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="app-version-input">Version Name</Label>
              <Input
                id="app-version-input"
                placeholder="e.g. 1.2.0"
                value={form.version}
                onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
                data-testid="input-app-version"
              />
              <p className="text-xs text-muted-foreground">Shown to the employee in the update dialog</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="app-build-input">Build Number</Label>
              <Input
                id="app-build-input"
                type="number"
                placeholder="e.g. 5"
                value={form.buildNumber}
                onChange={e => setForm(f => ({ ...f, buildNumber: e.target.value }))}
                data-testid="input-app-build"
              />
              <p className="text-xs text-muted-foreground">Must be higher than the installed build to trigger an update prompt</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="app-notes-input">Release Notes</Label>
            <Textarea
              id="app-notes-input"
              placeholder="What's new in this version..."
              value={form.releaseNotes}
              onChange={e => setForm(f => ({ ...f, releaseNotes: e.target.value }))}
              data-testid="input-app-notes"
              rows={3}
            />
          </div>

          <div className="space-y-3">
            <Label>APK File</Label>
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => document.getElementById("apk-upload-input")?.click()}
            >
              <input
                id="apk-upload-input"
                type="file"
                accept=".apk"
                className="hidden"
                onChange={e => setApkFile(e.target.files?.[0] || null)}
                data-testid="input-apk-file"
              />
              {apkFile ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                  <div className="font-medium">{apkFile.name}</div>
                  <div className="text-xs text-muted-foreground">{(apkFile.size / 1024 / 1024).toFixed(1)} MB — click to change</div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div className="font-medium">Click to select APK file</div>
                  <div className="text-xs text-muted-foreground">Uploaded APK will be hosted on this server and served to employees</div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">OR use external download URL</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <Input
              placeholder="https://example.com/hrms-app.apk"
              value={form.downloadUrl}
              onChange={e => setForm(f => ({ ...f, downloadUrl: e.target.value }))}
              data-testid="input-app-download-url"
              disabled={!!apkFile}
            />
            {!!apkFile && <p className="text-xs text-muted-foreground">External URL is ignored when an APK file is selected</p>}
          </div>

          <div className="flex items-center gap-3 p-4 border rounded-lg">
            <Switch
              id="mandatory-switch"
              checked={form.mandatory}
              onCheckedChange={v => setForm(f => ({ ...f, mandatory: v }))}
              data-testid="switch-mandatory-update"
            />
            <div>
              <Label htmlFor="mandatory-switch" className="cursor-pointer font-medium">Mandatory Update</Label>
              <p className="text-xs text-muted-foreground">Employees cannot skip the update — they must install it before using the app</p>
            </div>
          </div>

          <Button onClick={handleSave} disabled={uploading} className="w-full md:w-auto" data-testid="button-publish-app-version">
            {uploading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Publishing...</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" />Publish Update</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
