import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableHead } from "@/components/sortable-head";
import { useSort, sortData } from "@/lib/use-sort";
import type { SortDir } from "@/lib/use-sort";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => string | number | boolean | null | undefined;
  className?: string;
  headClassName?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T, index: number) => string;
  defaultSortCol?: string;
  defaultSortDir?: SortDir;
  emptyMessage?: ReactNode;
  rowTestId?: (row: T, index: number) => string;
  rowClassName?: (row: T, index: number) => string | undefined;
  className?: string;
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  defaultSortCol,
  defaultSortDir = "asc",
  emptyMessage = "No data available.",
  rowTestId,
  rowClassName,
  className,
}: DataTableProps<T>) {
  const { sort, toggle } = useSort(defaultSortCol, defaultSortDir ?? "asc");

  const sorted = sortData(data, sort, (item, col) => {
    const column = columns.find(c => c.key === col);
    return column?.sortValue ? column.sortValue(item) : undefined;
  });

  return (
    <Table className={className}>
      <TableHeader>
        <TableRow>
          {columns.map(col =>
            col.sortable && col.sortValue ? (
              <SortableHead key={col.key} col={col.key} sort={sort} onToggle={toggle} className={col.headClassName}>
                {col.header}
              </SortableHead>
            ) : (
              <TableHead key={col.key} className={col.headClassName}>
                {col.header}
              </TableHead>
            )
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          sorted.map((row, index) => (
            <TableRow key={rowKey(row, index)} className={rowClassName?.(row, index)} data-testid={rowTestId?.(row, index)}>
              {columns.map(col => (
                <TableCell key={col.key} className={col.className}>
                  {col.cell(row, index)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
