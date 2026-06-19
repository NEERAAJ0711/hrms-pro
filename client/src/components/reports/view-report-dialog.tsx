import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ViewReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  headers: string[];
  rows: (string | number)[][];
  sortCol: number | null;
  setSortCol: Dispatch<SetStateAction<number | null>>;
  sortDir: "asc" | "desc";
  setSortDir: Dispatch<SetStateAction<"asc" | "desc">>;
}

export function ViewReportDialog({
  open,
  onOpenChange,
  title,
  headers,
  rows,
  sortCol,
  setSortCol,
  sortDir,
  setSortDir,
}: ViewReportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-auto">
          {rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No data available for this report.</p>
          ) : (() => {
            // Keep footer row (TOTAL/GRAND TOTAL) pinned at bottom when sorting
            const lastRow = rows[rows.length - 1];
            const isFooter = lastRow && (String(lastRow[0]).includes("TOTAL") || String(lastRow[1]).includes("TOTAL") || String(lastRow[0]).includes("GRAND"));
            const bodyRows = isFooter ? rows.slice(0, -1) : rows;
            const footerRows = isFooter ? [lastRow] : [];

            const sorted = sortCol === null ? bodyRows : [...bodyRows].sort((a, b) => {
              const av = a[sortCol], bv = b[sortCol];
              if (typeof av === "number" && typeof bv === "number")
                return sortDir === "asc" ? av - bv : bv - av;
              return sortDir === "asc"
                ? String(av).localeCompare(String(bv))
                : String(bv).localeCompare(String(av));
            });

            const handleSort = (i: number) => {
              if (sortCol === i) setSortDir(d => d === "asc" ? "desc" : "asc");
              else { setSortCol(i); setSortDir("asc"); }
            };

            return (
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-background z-10">
                  <tr>
                    {headers.map((h, i) => (
                      <th
                        key={i}
                        onClick={() => handleSort(i)}
                        className="border px-3 py-2 text-left font-semibold bg-primary/10 text-xs whitespace-nowrap cursor-pointer select-none hover:bg-primary/20 transition-colors"
                      >
                        <span className="flex items-center gap-1">
                          {h}
                          <span className="text-[10px] text-muted-foreground">
                            {sortCol === i ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                          </span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                      {row.map((cell, ci) => <td key={ci} className="border px-3 py-2 text-xs whitespace-nowrap">{cell}</td>)}
                    </tr>
                  ))}
                  {footerRows.map((row, ri) => (
                    <tr key={`foot-${ri}`} className="bg-primary/10 font-semibold">
                      {row.map((cell, ci) => <td key={ci} className="border px-3 py-2 text-xs whitespace-nowrap font-bold">{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
