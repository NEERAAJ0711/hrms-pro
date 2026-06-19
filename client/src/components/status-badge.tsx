import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const DEFAULT_STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
  processed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  inactive: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

interface StatusBadgeProps {
  status: string;
  label?: string;
  styles?: Record<string, string>;
  className?: string;
  testId?: string;
}

export function StatusBadge({ status, label, styles, className, testId }: StatusBadgeProps) {
  const map = styles ?? DEFAULT_STATUS_STYLES;
  const style = map[status] ?? DEFAULT_STATUS_STYLES[status] ?? "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
  const text = label ?? (status ? status.charAt(0).toUpperCase() + status.slice(1) : "");
  return (
    <Badge variant="secondary" className={cn(style, className)} data-testid={testId}>
      {text}
    </Badge>
  );
}

export { DEFAULT_STATUS_STYLES };
