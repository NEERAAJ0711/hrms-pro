import { z } from "zod";

export const salaryStructureSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  companyId: z.string().min(1, "Company is required"),
  basicSalary: z.coerce.number().min(1, "Basic salary is required"),
  hra: z.coerce.number().default(0),
  conveyance: z.coerce.number().default(0),
  specialAllowance: z.coerce.number().default(0),
  otherAllowances: z.coerce.number().default(0),
  grossSalary: z.coerce.number(),
  pfEmployee: z.coerce.number().default(0),
  pfEmployer: z.coerce.number().default(0),
  vpfAmount: z.coerce.number().min(0).default(0),
  esi: z.coerce.number().default(0),
  professionalTax: z.coerce.number().default(0),
  lwfEmployee: z.coerce.number().default(0),
  tds: z.coerce.number().default(0),
  otherDeductions: z.coerce.number().default(0),
  netSalary: z.coerce.number(),
  effectiveFrom: z.string().min(1, "Effective date is required"),
});

export type SalaryStructureFormValues = z.infer<typeof salaryStructureSchema>;

export const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
  processed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
};

export const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
