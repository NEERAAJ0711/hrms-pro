import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import type { SortState } from "@/lib/use-sort";
import { cn } from "@/lib/utils";

interface SortableHeadProps {
  col: string;
  sort: SortState;
  onToggle: (col: string) => void;
  className?: string;
  children: React.ReactNode;
}

export function SortableHead({ col, sort, onToggle, className, children }: SortableHeadProps) {
  const active = sort.col === col;
  return (
    <TableHead
      className={cn("cursor-pointer select-none whitespace-nowrap", className)}
      onClick={() => onToggle(col)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active && sort.dir === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5 text-primary" />
        ) : active && sort.dir === "desc" ? (
          <ArrowDown className="h-3.5 w-3.5 text-primary" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground opacity-40" />
        )}
      </span>
    </TableHead>
  );
}
