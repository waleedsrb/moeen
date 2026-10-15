"use client";

import {
  KanbanBoard,
  type KanbanColumn,
} from "@/components/ui/kanban-board";
import {
  ORDER_BOARD_STATUSES,
  ORDER_STATUS_LABELS,
  canTransition,
} from "@/types/order";
import type { OrderStatus, OrderWithCustomer } from "@/types/order";
import { OrderCard } from "./order-card";

interface OrdersBoardProps {
  orders: OrderWithCustomer[];
  onStatusChange: (orderId: string, status: OrderStatus) => Promise<void>;
}

type BoardCard = { id: string; column: string; order: OrderWithCustomer };

// Chip colours follow the lifecycle palette through the theme's chart
// tokens: 1 blue (incoming), 2 green (confirmed), 3 amber (pending: the AI
// is still collecting details), 4 violet (in delivery).
const TONES: Record<string, KanbanColumn["tone"]> = {
  collecting: 3,
  incoming: 1,
  confirmed: 2,
  out_for_delivery: 4,
};

const COLUMNS: KanbanColumn[] = ORDER_BOARD_STATUSES.map((status) => ({
  id: status,
  title: ORDER_STATUS_LABELS[status],
  tone: TONES[status],
}));

export function OrdersBoard({ orders, onStatusChange }: OrdersBoardProps) {
  const cards: BoardCard[] = orders
    .filter((order) => ORDER_BOARD_STATUSES.includes(order.status))
    .map((order) => ({ id: order.id, column: order.status, order }));
  const currency = orders[0]?.currency ?? "ILS";

  return (
    <KanbanBoard<BoardCard>
      label="Orders board"
      columns={COLUMNS}
      cards={cards}
      // Orders own their place: the parent updates them optimistically in onMove.
      onCardsChange={() => {}}
      cardLabel={(card) =>
        `${card.order.order_number}, ${card.order.customers?.name ?? "Unknown customer"}`
      }
      refuse={(card, column) =>
        canTransition(card.order.status, column.id as OrderStatus)
          ? null
          : `Can't move to ${column.title}`
      }
      onMove={(card, to) => onStatusChange(card.id, to.id as OrderStatus)}
      value={(card) => card.order.total}
      valueFormat={{ style: "currency", currency }}
      locales="en-US"
      renderCard={(card) => (
        <OrderCard order={card.order} onStatusChange={onStatusChange} />
      )}
    />
  );
}
