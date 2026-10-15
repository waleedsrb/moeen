"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils/inventory";
import { statusColorClass, timeElapsed } from "@/lib/utils/orders";
import { ORDER_ALLOWED_TRANSITIONS, ORDER_STATUS_LABELS } from "@/types/order";
import type { OrderStatus, OrderWithCustomer } from "@/types/order";

interface OrdersListProps {
  orders: OrderWithCustomer[];
  onStatusChange?: (orderId: string, status: OrderStatus) => Promise<void>;
}

function itemLabel(order: OrderWithCustomer): string {
  return order.order_items.map((item) => item.product_name).join(", ");
}

export function OrdersList({ orders, onStatusChange }: OrdersListProps) {
  const router = useRouter();

  const columns = useMemo<DataTableColumn<OrderWithCustomer>[]>(
    () => [
      {
        key: "number",
        header: "#",
        width: "minmax(0,0.7fr)",
        sortable: true,
        card: "title",
        value: (order) => order.order_number,
        cell: (order) => (
          <span className="font-mono">{order.order_number}</span>
        ),
      },
      {
        key: "customer",
        header: "Customer",
        width: "minmax(0,1fr)",
        sortable: true,
        card: "subtitle",
        value: (order) => order.customers?.name ?? "Unknown customer",
      },
      {
        key: "items",
        header: "Items",
        width: "minmax(0,1.6fr)",
        sortable: true,
        card: "hidden",
        value: (order) => itemLabel(order),
      },
      {
        key: "total",
        header: "Total",
        width: "minmax(0,0.8fr)",
        sortable: true,
        card: "trailing",
        value: (order) => order.total,
        cell: (order) => (
          <span className="font-mono">
            {formatPrice(order.total, order.currency)}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        width: "minmax(0,0.9fr)",
        sortable: true,
        card: "trailing",
        value: (order) => order.status,
        cell: (order) => (
          <Badge
            variant="outline"
            className={cn("font-medium", statusColorClass(order.status))}
          >
            {ORDER_STATUS_LABELS[order.status]}
          </Badge>
        ),
      },
      {
        key: "created",
        header: "Created",
        width: "minmax(0,0.7fr)",
        sortable: true,
        card: "hidden",
        value: (order) => new Date(order.created_at),
        cell: (order) => (
          <span className="font-mono text-xs text-muted-foreground">
            {timeElapsed(order.created_at)}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <DataTable
      label="Orders"
      noun={["order", "orders"]}
      columns={columns}
      rows={orders}
      searchable={false}
      defaultSort={{ key: "created", dir: "desc" }}
      pageSize={Math.max(orders.length, 1)}
      rowLabel={(order) => order.order_number}
      onRowOpen={(order) => router.push(`/orders/${order.id}`)}
      rowMenu={(order) => {
        const nextStatuses = ORDER_ALLOWED_TRANSITIONS[order.status];
        return (
          <>
            <ContextMenuItem
              onClick={() => navigator.clipboard.writeText(order.order_number)}
            >
              Copy order number
            </ContextMenuItem>
            {onStatusChange && nextStatuses.length > 0 && (
              <>
                <ContextMenuSeparator />
                {nextStatuses.map((status) => (
                  <ContextMenuItem
                    key={status}
                    variant={status === "cancelled" ? "destructive" : "default"}
                    onClick={() => {
                      onStatusChange(order.id, status).catch(() => {});
                    }}
                  >
                    {status === "cancelled"
                      ? "Cancel order"
                      : `Mark as ${ORDER_STATUS_LABELS[status]}`}
                  </ContextMenuItem>
                ))}
              </>
            )}
          </>
        );
      }}
    />
  );
}
