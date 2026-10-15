"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { formatOrderNumber, timeElapsed } from "@/lib/utils/orders";
import { ORDER_ALLOWED_TRANSITIONS, ORDER_STATUS_LABELS } from "@/types/order";
import type { OrderStatus, OrderWithCustomer } from "@/types/order";

interface OrderCardProps {
  order: OrderWithCustomer;
  onStatusChange?: (orderId: string, status: OrderStatus) => Promise<void>;
}

function itemsSummary(order: OrderWithCustomer): string {
  const count = order.order_items.reduce((sum, item) => sum + item.quantity, 0);
  const names = order.order_items.map((item) => item.product_name);
  const visible = names.slice(0, 2).join(", ");
  const suffix = names.length > 2 ? ` +${names.length - 2}` : "";
  return `${count} ${count === 1 ? "item" : "items"} - ${visible}${suffix}`;
}

/**
 * The body of an order on the board. The Hairline kanban draws the card's
 * frame, its lifecycle status chip and its total underneath.
 */
export function OrderCard({ order, onStatusChange }: OrderCardProps) {
  const customerName = order.customers?.name ?? "Unknown customer";
  const nextStatuses = ORDER_ALLOWED_TRANSITIONS[order.status];

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Link
          href={`/orders/${order.id}`}
          draggable={false}
          className="block text-sm focus-visible:outline-none"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs font-medium text-foreground">
                {formatOrderNumber(order.order_number)}
              </p>
              <p className="mt-1 truncate font-medium text-foreground">
                {customerName}
              </p>
            </div>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {timeElapsed(order.updated_at ?? order.created_at)}
            </span>
          </div>

          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
            {itemsSummary(order)}
          </p>

          {order.ai_extracted && (
            <Badge
              variant="outline"
              className="mt-2 border-ai/30 bg-ai/10 font-mono text-[10px] text-ai"
              title={`AI extracted - ${Math.round((order.ai_confidence ?? 0) * 100)}% confidence`}
            >
              AI {Math.round((order.ai_confidence ?? 0) * 100)}%
            </Badge>
          )}
        </Link>
      </ContextMenuTrigger>
      <ContextMenuContent>
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
      </ContextMenuContent>
    </ContextMenu>
  );
}
