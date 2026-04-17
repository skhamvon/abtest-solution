import type { SortDir } from "@/lib/sortTypes";

type Props = {
  label: string;
  columnKey: string;
  activeKey: string;
  dir: SortDir;
  onSort: (key: string) => void;
};

export function SortableTh({
  label,
  columnKey,
  activeKey,
  dir,
  onSort,
}: Props) {
  const active = activeKey === columnKey;
  return (
    <th
      scope="col"
      aria-sort={
        active ? (dir === "asc" ? "ascending" : "descending") : undefined
      }
    >
      <button
        type="button"
        className={`table-sort-btn${active ? " is-active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onSort(columnKey);
        }}
      >
        <span>{label}</span>
        <span className="table-sort-btn__hint" aria-hidden>
          {active ? (dir === "asc" ? " ↑" : " ↓") : " ⇅"}
        </span>
      </button>
    </th>
  );
}
