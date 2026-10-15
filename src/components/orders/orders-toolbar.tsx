"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { FilterBar, type Filter } from "@/components/ui/filter-bar";
import { ORDER_FILTER_FIELDS } from "./order-filters";
import { ManualOrderSheet } from "./manual-order-sheet";

interface DateRange {
  from?: string;
  to?: string;
}

interface OrdersToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
  matchCount: number;
  totalCount: number;
  dateRange: DateRange | null;
  onDateRangeChange: (value: DateRange | null) => void;
  view: "board" | "list";
  onViewChange: (view: "board" | "list") => void;
  isCreateOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}

export function OrdersToolbar({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  matchCount,
  totalCount,
  dateRange,
  onDateRangeChange,
  view,
  onViewChange,
  isCreateOpen,
  onCreateOpenChange,
}: OrdersToolbarProps) {
  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    const timer = window.setTimeout(() => onSearchChange(searchInput), 200);
    return () => window.clearTimeout(timer);
  }, [onSearchChange, searchInput]);

  function handleDateRangeChange(from: string | undefined, to: string | undefined) {
    onDateRangeChange(from || to ? { from, to } : null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search orders, customers, phones..."
            className="sm:max-w-xs"
          />

          <FilterBar
            label="Filter orders"
            fields={ORDER_FILTER_FIELDS}
            value={filters}
            onValueChange={onFiltersChange}
            count={matchCount}
            total={totalCount}
            noun={["order", "orders"]}
          />

          <DateRangePicker
            from={dateRange?.from}
            to={dateRange?.to}
            onChange={handleDateRangeChange}
            className="w-full sm:w-auto"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-1">
            <Button
              type="button"
              size="sm"
              variant={view === "board" ? "secondary" : "ghost"}
              onClick={() => onViewChange("board")}
            >
              Board
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === "list" ? "secondary" : "ghost"}
              onClick={() => onViewChange("list")}
            >
              List
            </Button>
          </div>
          <Button type="button" onClick={() => onCreateOpenChange(true)}>
            New Order
          </Button>
        </div>
      </div>

      <ManualOrderSheet open={isCreateOpen} onOpenChange={onCreateOpenChange} />
    </div>
  );
}
