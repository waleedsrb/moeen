import type { Filter, FilterField } from "@/components/ui/filter-bar";
import { ORDER_BOARD_STATUSES, ORDER_STATUS_LABELS } from "@/types/order";
import type { OrderStatus, OrderWithCustomer } from "@/types/order";

// What the Orders filter bar can filter the live board/list by.
export const ORDER_FILTER_FIELDS: FilterField<OrderWithCustomer>[] = [
  {
    id: "status",
    label: "Status",
    type: "option",
    options: ORDER_BOARD_STATUSES.map((status) => ({
      value: status,
      label: ORDER_STATUS_LABELS[status],
    })),
  },
  {
    id: "source",
    label: "Created by",
    type: "option",
    options: [
      { value: "ai", label: "AI" },
      { value: "merchant", label: "Merchant" },
    ],
    get: (order) => (order.ai_extracted ? "ai" : "merchant"),
  },
  {
    id: "total",
    label: "Total",
    type: "number",
  },
  {
    id: "created_at",
    label: "Created",
    type: "date",
    get: (order) => new Date(order.created_at),
  },
];

/** The dashboard links here with ?status=…; that becomes the bar's first chip. */
export function filtersFromStatus(status: OrderStatus | null): Filter[] {
  return status
    ? [{ id: "status", field: "status", op: "is", values: [status] }]
    : [];
}
