"use client";

import { useState } from "react";
import { StatusButton } from "@/components/ui/status-button";
import {
  ApprovalCard,
  type ApprovalStatus,
} from "@/components/ui/approval-card";
import { toast } from "@/components/ui/toast-stack";
import { formatPrice } from "@/lib/utils/inventory";
import {
  ORDER_ALLOWED_TRANSITIONS,
  ORDER_STATUS_LABELS,
} from "@/types/order";
import type { OrderDetail, OrderStatus } from "@/types/order";

interface OrderStatusActionsProps {
  order: OrderDetail;
  onOrderChange: (order: OrderDetail) => void;
}

export function OrderStatusActions({
  order,
  onOrderChange,
}: OrderStatusActionsProps) {
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The take-over card folds as soon as the merchant decides; it unfolds
  // again if the status update fails.
  const [decision, setDecision] = useState<ApprovalStatus | null>(null);

  const isCollecting = order.status === "collecting";

  const nextStatuses = [...ORDER_ALLOWED_TRANSITIONS[order.status]].sort(
    (a, b) => {
      if (a === "cancelled") return 1;
      if (b === "cancelled") return -1;
      return 0;
    }
  );

  if (nextStatuses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No further status actions are available.
      </p>
    );
  }

  async function updateStatus(status: OrderStatus) {
    setPendingStatus(status);
    setError(null);

    const response = await fetch(`/api/orders/${order.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    const data = (await response.json()) as {
      order?: OrderDetail;
      error?: string;
    };

    setPendingStatus(null);

    if (!response.ok || !data.order) {
      setDecision(null);
      setError(data.error ?? "Status update failed");
      return;
    }

    onOrderChange(data.order);
    toast.success(
      status === "cancelled"
        ? `${data.order.order_number} cancelled`
        : `${data.order.order_number} moved to ${ORDER_STATUS_LABELS[status]}`
    );
  }

  if (isCollecting) {
    const itemCount = order.order_items.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
    return (
      <div className="space-y-2">
        <ApprovalCard
          title="Take over this AI draft"
          description="The AI is still collecting details from the customer. Marking it Incoming reserves stock and makes it a live order."
          details={[
            { label: "Items", value: <span className="font-mono">{itemCount}</span> },
            {
              label: "Total",
              value: (
                <span className="font-mono">
                  {formatPrice(order.total, order.currency)}
                </span>
              ),
            },
          ]}
          status={decision ?? "pending"}
          approveLabel="Mark as Incoming"
          denyLabel="Cancel order"
          onApprove={() => {
            setDecision("approved");
            updateStatus("incoming");
          }}
          onDeny={() => {
            setDecision("denied");
            updateStatus("cancelled");
          }}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {nextStatuses.map((status) => (
          <StatusButton
            key={status}
            type="button"
            variant={status === "cancelled" ? "outline" : "primary"}
            className={status === "cancelled" ? "text-destructive" : undefined}
            disabled={pendingStatus !== null && pendingStatus !== status}
            status={pendingStatus === status ? "pending" : "idle"}
            labels={{
              idle:
                status === "cancelled"
                  ? "Cancel order"
                  : ORDER_STATUS_LABELS[status],
              pending: "Updating",
            }}
            onClick={() => updateStatus(status)}
          />
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
