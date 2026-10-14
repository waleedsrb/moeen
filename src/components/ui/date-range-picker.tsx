"use client";

import * as React from "react";
import { format } from "date-fns";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DateRangePicker as HairlineDateRangePicker,
  type DateRange,
} from "@/components/ui/hairline-date-range-picker";

// The rest of the app stores date-range filters as plain "yyyy-MM-dd"
// strings (the native <input type="date"> format), so this wraps the
// Hairline picker's Date-based range and speaks that format at the boundary.
function toDate(value?: string) {
  return value ? new Date(`${value}T00:00:00`) : undefined;
}

function toValue(date?: Date) {
  return date ? format(date, "yyyy-MM-dd") : undefined;
}

interface DateRangePickerProps {
  from?: string;
  to?: string;
  onChange: (from: string | undefined, to: string | undefined) => void;
  placeholder?: string;
  className?: string;
}

export function DateRangePicker({
  from,
  to,
  onChange,
  placeholder = "Date range",
  className,
}: DateRangePickerProps) {
  const start = toDate(from);
  const end = toDate(to ?? from);
  const value: DateRange | null = start && end ? { start, end } : null;

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <HairlineDateRangePicker
        value={value}
        onValueChange={(range) => onChange(toValue(range.start), toValue(range.end))}
        placeholder={placeholder}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear date range"
          onClick={() => onChange(undefined, undefined)}
          className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
