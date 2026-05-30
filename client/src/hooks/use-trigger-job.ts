import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export type AutomationJobType =
  | "epfo_uan_generate"
  | "epfo_bulk_register"
  | "epfo_kyc_aadhaar"
  | "epfo_kyc_pan"
  | "epfo_kyc_bank"
  | "epfo_ecr_file"
  | "epfo_bulk_ecr"
  | "epfo_challan_download"
  | "epfo_passbook_status"
  | "epfo_exit_management"
  | "epfo_login_test"
  | "esic_ip_generate"
  | "esic_bulk_register"
  | "esic_monthly_file"
  | "esic_challan_download"
  | "esic_employee_search"
  | "esic_employee_list"
  | "esic_login_test"
  | "epfo_employee_list"
  | "epfo_trrn_track";

export interface TriggerJobOptions {
  jobType: AutomationJobType;
  companyId?: string;
  payload?: Record<string, unknown>;
  maxRetries?: number;
  scheduledAt?: string;
}

export interface JobResult {
  id: string;
  jobType: string;
  status: string;
  companyId: string;
  createdAt: string;
}

export function useTriggerJob(invalidateKeys?: string[]) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation<JobResult, Error, TriggerJobOptions>({
    mutationFn: async (opts) => {
      const res = await apiRequest("POST", "/api/automation/jobs", opts);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Job queued",
        description: `Job #${data.id.slice(0, 8)} has been queued successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/jobs"] });
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
      }
    },
    onError: (err) => {
      toast({
        title: "Failed to queue job",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    },
  });
}
