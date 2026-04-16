import { Card, CardContent } from "@/components/ui/card";
import { Clock, CalendarCheck, Wallet, Settings, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface ComingSoonPageProps {
  feature: "attendance" | "leave" | "payroll" | "settings";
}

const featureConfig = {
  attendance: {
    title: "Attendance Management",
    description: "Track employee attendance, manage shifts, and generate attendance reports with our comprehensive attendance module.",
    icon: CalendarCheck,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  leave: {
    title: "Leave Management",
    description: "Manage leave requests, track balances, configure leave policies, and automate approval workflows.",
    icon: Clock,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  payroll: {
    title: "Payroll Processing",
    description: "Process salaries, manage tax calculations, generate payslips, and handle statutory compliance automatically.",
    icon: Wallet,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  settings: {
    title: "System Settings",
    description: "Configure system preferences, manage integrations, customize workflows, and set up notifications.",
    icon: Settings,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
};

export function ComingSoonPage({ feature }: ComingSoonPageProps) {
  const [, setLocation] = useLocation();
  const config = featureConfig[feature];
  const Icon = config.icon;

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center">
          <div className={`mx-auto w-20 h-20 rounded-full ${config.bgColor} flex items-center justify-center mb-6`}>
            <Icon className={`h-10 w-10 ${config.color}`} />
          </div>
          
          <h1 className="text-2xl font-bold mb-2" data-testid={`text-title-${feature}`}>
            {config.title}
          </h1>
          
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <Clock className="h-4 w-4" />
            Coming Soon
          </div>
          
          <p className="text-muted-foreground mb-6" data-testid={`text-description-${feature}`}>
            {config.description}
          </p>
          
          <Button 
            variant="outline" 
            onClick={() => setLocation("/")}
            data-testid="button-back-dashboard"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function AttendancePage() {
  return <ComingSoonPage feature="attendance" />;
}

export function LeavePage() {
  return <ComingSoonPage feature="leave" />;
}

export function PayrollPage() {
  return <ComingSoonPage feature="payroll" />;
}

export function SettingsPage() {
  return <ComingSoonPage feature="settings" />;
}
