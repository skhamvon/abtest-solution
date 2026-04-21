import type { SegmentConfig } from "@abtest-solution/core";
import type { SortDir } from "./sortTypes";

export type SegmentListRow = SegmentConfig & { campaignCount: number };

export type SegmentSortKey = "id" | "name" | "campaignCount";

export function compareSegments(
  a: SegmentListRow,
  b: SegmentListRow,
  key: SegmentSortKey,
  dir: SortDir,
): number {
  const m = dir === "asc" ? 1 : -1;
  switch (key) {
    case "id":
      return m * (a.id - b.id);
    case "name":
      return m * a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
    case "campaignCount":
      return m * (a.campaignCount - b.campaignCount);
    default:
      return 0;
  }
}

export function sortSegments(
  list: SegmentListRow[],
  key: SegmentSortKey,
  dir: SortDir,
): SegmentListRow[] {
  return [...list].sort((a, b) => compareSegments(a, b, key, dir));
}
