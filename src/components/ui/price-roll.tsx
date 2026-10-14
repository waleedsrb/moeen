"use client";

import { NumberRoll } from "@/components/ui/number-roll";
import { currencySymbol } from "@/lib/utils/inventory";

const TWO_DECIMALS = { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false };

/** A price that rolls when it changes; reads the same as formatPrice(). */
export function PriceRoll({ value, currency }: { value: number; currency?: string }) {
  return (
    <NumberRoll
      value={value}
      prefix={currencySymbol(currency)}
      format={TWO_DECIMALS}
      locales="en-US"
      duration={400}
    />
  );
}
