"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { TableHead } from "@/components/ui/table";

type Props = {
  label: string;
  sortKey: string;
};

export function SortableHead({ label, sortKey }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSort = searchParams.get("sort");
  const currentDir = searchParams.get("dir") ?? "asc";

  function toggleSort() {
    const nextDir =
      currentSort === sortKey && currentDir === "asc"
        ? "desc"
        : "asc";

    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", sortKey);
    params.set("dir", nextDir);
    params.set("page", "1"); // sempre volta pra página 1

    router.replace(`?${params.toString()}`, {
      scroll: false,
    });
  }

  return (
    <TableHead
      onClick={toggleSort}
      className="cursor-pointer select-none hover:text-primary"
    >
      <span className="flex items-center gap-1">
        {label}
        {currentSort === sortKey && (
          <span className="text-xs">
            {currentDir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </span>
    </TableHead>
  );
}