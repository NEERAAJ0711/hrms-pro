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
import type { SettingFormData } from "./types";

export function GeneralSettings({ formData, handleInputChange }: { formData: SettingFormData; handleInputChange: (key: keyof SettingFormData, value: string | boolean) => void }) {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Working Hours
          </CardTitle>
          <CardDescription>Configure standard working hours for the organization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="workingHoursStart">Start Time</Label>
              <Input
                id="workingHoursStart"
                type="time"
                value={formData.workingHoursStart}
                onChange={(e) => handleInputChange("workingHoursStart", e.target.value)}
                data-testid="input-working-start"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workingHoursEnd">End Time</Label>
              <Input
                id="workingHoursEnd"
                type="time"
                value={formData.workingHoursEnd}
                onChange={(e) => handleInputChange("workingHoursEnd", e.target.value)}
                data-testid="input-working-end"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="weekStartDay">Week Starts On</Label>
            <Select value={formData.weekStartDay} onValueChange={(v) => handleInputChange("weekStartDay", v)}>
              <SelectTrigger data-testid="select-week-start">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sunday">Sunday</SelectItem>
                <SelectItem value="monday">Monday</SelectItem>
                <SelectItem value="saturday">Saturday</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Fiscal Year
          </CardTitle>
          <CardDescription>Set the fiscal year start month</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="fiscalYearStart">Fiscal Year Starts</Label>
            <Select value={formData.fiscalYearStart} onValueChange={(v) => handleInputChange("fiscalYearStart", v)}>
              <SelectTrigger data-testid="select-fiscal-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="01">January</SelectItem>
                <SelectItem value="04">April (India)</SelectItem>
                <SelectItem value="07">July</SelectItem>
                <SelectItem value="10">October</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function LocalizationSettings({ formData, handleInputChange }: { formData: SettingFormData; handleInputChange: (key: keyof SettingFormData, value: string | boolean) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Localization Settings</CardTitle>
        <CardDescription>Configure date, time, and currency formats</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="dateFormat">Date Format</Label>
            <Select value={formData.dateFormat} onValueChange={(v) => handleInputChange("dateFormat", v)}>
              <SelectTrigger data-testid="select-date-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="timeFormat">Time Format</Label>
            <Select value={formData.timeFormat} onValueChange={(v) => handleInputChange("timeFormat", v)}>
              <SelectTrigger data-testid="select-time-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12h">12-hour</SelectItem>
                <SelectItem value="24h">24-hour</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Separator />
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select value={formData.timezone} onValueChange={(v) => handleInputChange("timezone", v)}>
              <SelectTrigger data-testid="select-timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Asia/Kolkata">India (IST)</SelectItem>
                <SelectItem value="America/New_York">US Eastern</SelectItem>
                <SelectItem value="America/Los_Angeles">US Pacific</SelectItem>
                <SelectItem value="Europe/London">UK (GMT)</SelectItem>
                <SelectItem value="Asia/Singapore">Singapore</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Select value={formData.currency} onValueChange={(v) => handleInputChange("currency", v)}>
              <SelectTrigger data-testid="select-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INR">Indian Rupee (INR)</SelectItem>
                <SelectItem value="USD">US Dollar (USD)</SelectItem>
                <SelectItem value="EUR">Euro (EUR)</SelectItem>
                <SelectItem value="GBP">British Pound (GBP)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function NotificationSettings({ formData, handleInputChange }: { formData: SettingFormData; handleInputChange: (key: keyof SettingFormData, value: string | boolean) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>Configure email and system notifications</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Email Notifications</Label>
            <p className="text-sm text-muted-foreground">Receive important updates via email</p>
          </div>
          <Switch
            checked={formData.enableEmailNotifications}
            onCheckedChange={(v) => handleInputChange("enableEmailNotifications", v)}
            data-testid="switch-email-notifications"
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Leave Approval Notifications</Label>
            <p className="text-sm text-muted-foreground">Get notified when leave requests need approval</p>
          </div>
          <Switch
            checked={formData.enableLeaveApprovalNotifications}
            onCheckedChange={(v) => handleInputChange("enableLeaveApprovalNotifications", v)}
            data-testid="switch-leave-notifications"
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Payroll Notifications</Label>
            <p className="text-sm text-muted-foreground">Get notified about payroll processing updates</p>
          </div>
          <Switch
            checked={formData.enablePayrollNotifications}
            onCheckedChange={(v) => handleInputChange("enablePayrollNotifications", v)}
            data-testid="switch-payroll-notifications"
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Attendance Reminders</Label>
            <p className="text-sm text-muted-foreground">Send daily reminders for marking attendance</p>
          </div>
          <Switch
            checked={formData.enableAttendanceReminders}
            onCheckedChange={(v) => handleInputChange("enableAttendanceReminders", v)}
            data-testid="switch-attendance-reminders"
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function SecuritySettings({ formData, handleInputChange }: { formData: SettingFormData; handleInputChange: (key: keyof SettingFormData, value: string | boolean) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Security Settings</CardTitle>
        <CardDescription>Configure security and access controls</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="passwordMinLength">Minimum Password Length</Label>
            <Select value={formData.passwordMinLength} onValueChange={(v) => handleInputChange("passwordMinLength", v)}>
              <SelectTrigger data-testid="select-password-length">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6 characters</SelectItem>
                <SelectItem value="8">8 characters</SelectItem>
                <SelectItem value="10">10 characters</SelectItem>
                <SelectItem value="12">12 characters</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
            <Select value={formData.sessionTimeout} onValueChange={(v) => handleInputChange("sessionTimeout", v)}>
              <SelectTrigger data-testid="select-session-timeout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
                <SelectItem value="120">2 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Two-Factor Authentication</Label>
            <p className="text-sm text-muted-foreground">Require 2FA for all users</p>
          </div>
          <Switch
            checked={formData.twoFactorEnabled}
            onCheckedChange={(v) => handleInputChange("twoFactorEnabled", v)}
            data-testid="switch-2fa"
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>IP Restriction</Label>
            <p className="text-sm text-muted-foreground">Restrict access to specific IP addresses</p>
          </div>
          <Switch
            checked={formData.ipRestriction}
            onCheckedChange={(v) => handleInputChange("ipRestriction", v)}
            data-testid="switch-ip-restriction"
          />
        </div>
      </CardContent>
    </Card>
  );
}

