import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  companyId: string;
  department?: string | null;
  designation?: string | null;
  exitDate?: string | null;
  status?: string | null;
}

interface SearchableEmployeeSelectProps {
  employees: Employee[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  renderLabel?: (emp: Employee) => string;
  "data-testid"?: string;
}

export function SearchableEmployeeSelect({
  employees,
  value,
  onValueChange,
  placeholder = "Search by name or ID...",
  disabled = false,
  className,
  renderLabel,
  "data-testid": dataTestId,
}: SearchableEmployeeSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selectedEmployee = employees.find((emp) => emp.id === value);

  const getLabel = (emp: Employee) => {
    if (renderLabel) return renderLabel(emp);
    return `[${emp.employeeCode}] ${emp.firstName} ${emp.lastName}`;
  };

  const filtered = React.useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.toLowerCase();
    return employees.filter((emp) => {
      const text = `${emp.employeeCode} ${emp.firstName} ${emp.lastName} ${emp.department || ""} ${emp.designation || ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [employees, search]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal h-10",
            !value && "text-muted-foreground",
            className
          )}
          data-testid={dataTestId}
        >
          <span className="truncate">
            {selectedEmployee ? getLabel(selectedEmployee) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No employee found.</p>
          ) : (
            filtered.map((emp) => (
              <div
                key={emp.id}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer text-sm hover:bg-accent hover:text-accent-foreground",
                  value === emp.id && "bg-accent"
                )}
                onClick={() => {
                  onValueChange(emp.id);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    value === emp.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">
                    <span className="text-primary font-semibold">[{emp.employeeCode}]</span>{" "}
                    {emp.firstName} {emp.lastName}
                  </span>
                  {(emp.department || emp.designation) && (
                    <span className="text-xs text-muted-foreground truncate">
                      {emp.department || ""}{emp.department && emp.designation ? " · " : ""}{emp.designation || ""}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
