import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, Activity, CalendarDays, Bot } from "lucide-react";
import EpfoPage from "./epfo";
import EsicPage from "./esic";
import ComplianceCalendarPage from "./compliance-calendar";
import AutomationJobsPage from "./automation-jobs";

export default function ComplianceAutomationPage() {
  const [tab, setTab] = useState("epfo");

  return (
    <div className="min-h-full">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="sticky top-0 z-20 bg-background border-b px-4 pt-3 pb-0">
          <TabsList className="h-10 gap-0.5">
            <TabsTrigger value="epfo" className="gap-1.5" data-testid="tab-compliance-epfo">
              <ShieldCheck className="h-4 w-4" />
              EPFO Automation
            </TabsTrigger>
            <TabsTrigger value="esic" className="gap-1.5" data-testid="tab-compliance-esic">
              <Activity className="h-4 w-4" />
              ESIC Automation
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-1.5" data-testid="tab-compliance-calendar">
              <CalendarDays className="h-4 w-4" />
              Compliance Calendar
            </TabsTrigger>
            <TabsTrigger value="jobs" className="gap-1.5" data-testid="tab-compliance-jobs">
              <Bot className="h-4 w-4" />
              Automation Jobs
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="epfo" className="mt-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          <EpfoPage />
        </TabsContent>
        <TabsContent value="esic" className="mt-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          <EsicPage />
        </TabsContent>
        <TabsContent value="calendar" className="mt-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          <ComplianceCalendarPage />
        </TabsContent>
        <TabsContent value="jobs" className="mt-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          <AutomationJobsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
