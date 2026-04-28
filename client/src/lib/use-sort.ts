import { useState, useCallback } from "react";

export type SortDir = "asc" | "desc" | null;

export interface SortState {
  col: string | null;
  dir: SortDir;
}

export function useSort(defaultCol?: string, defaultDir: SortDir = "asc") {
  const [sort, setSort] = useState<SortState>({
    col: defaultCol ?? null,
    dir: defaultCol ? defaultDir : null,
  });

  const toggle = useCallback((col: string) => {
    setSort(prev => {
      if (prev.col !== col) return { col, dir: "asc" };
      if (prev.dir === "asc") return { col, dir: "desc" };
      return { col: null, dir: null };
    });
  }, []);

  return { sort, toggle };
}

export function sortData<T>(
  data: T[],
  sort: SortState,
  resolver: (item: T, col: string) => string | number | boolean | null | undefined
): T[] {
  if (!sort.col || !sort.dir) return data;
  const col = sort.col;
  const dir = sort.dir;
  return [...data].sort((a, b) => {
    const av = resolver(a, col) ?? "";
    const bv = resolver(b, col) ?? "";
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).toLowerCase().localeCompare(String(bv).toLowerCase());
    return dir === "asc" ? cmp : -cmp;
  });
}
