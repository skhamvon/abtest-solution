import { countSegmentLeaves, type SegmentConfig } from "@abtest-solution/core";
import type { SortDir } from "./sortTypes";

export type SegmentSortKey = "id" | "name" | "rules";

export function compareSegments(
  a: SegmentConfig,
  b: SegmentConfig,
  key: SegmentSortKey,
  dir: SortDir,
): number {
  const m = dir === "asc" ? 1 : -1;
  switch (key) {
    case "id":
      return m * (a.id - b.id);
    case "name":
      return m * a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
    case "rules":
      return (
        m *
        (countSegmentLeaves(a.condition) - countSegmentLeaves(b.condition))
      );
    default:
      return 0;
  }
}

export function sortSegments(
  list: SegmentConfig[],
  key: SegmentSortKey,
  dir: SortDir,
): SegmentConfig[] {
  return [...list].sort((a, b) => compareSegments(a, b, key, dir));
}
