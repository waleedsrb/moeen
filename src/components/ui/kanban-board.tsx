// Hairline UI · kanban-board · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

// Mo'een adaptation: physical spacing/position utilities switched to logical (RTL-safe) ones.
"use client";

import * as React from "react";
import { FoldHorizontal, Plus, UnfoldHorizontal } from "lucide-react";
import { NumberRoll } from "./number-roll";
import { TextMorph } from "./text-morph";
import { useBoardDrag, type BoardOver } from "./use-board-drag";

/* ─────────────────────────────────────────────────────────
 * KANBAN BOARD: a pipeline you rearrange by hand
 *
 *   carry     pick a card up (4px, or a hold on touch) and it
 *             follows you, tilting with your speed; the column
 *             under it opens a gap at the exact slot while the
 *             one it left closes up
 *   becomes   its status chip turns into the column it's over
 *             while it's still in the air: the label morphs,
 *             the colour crossfades, a done column draws a check
 *   totals    the counts and the money in each column roll as
 *             the card leaves one and enters the next
 *   refuse    a column at its limit, or with a rule the card
 *             breaks, turns amber, says why and opens no gap;
 *             let go and the card springs home
 *   drop      it lands in its slot with a slight overshoot; a
 *             save that fails flies it back with a shake
 *   add       "+ Add deal" grows into a card you type into
 *   keys      Space picks up, arrows carry, Space drops, Escape
 *             puts it back
 * ───────────────────────────────────────────────────────── */

export interface KanbanColumn {
  id: string;
  title: string;
  /** Which of the theme's five chart colours its chip uses. */
  tone?: 1 | 2 | 3 | 4 | 5;
  /** How many cards it holds; it refuses more. */
  limit?: number;
  /** The finishing column: its chip draws a check. */
  done?: boolean;
}

export type KanbanCard = { id: string; column: string };

export interface KanbanBoardProps<T extends KanbanCard> extends Omit<React.HTMLAttributes<HTMLDivElement>, "children" | "defaultValue"> {
  columns: KanbanColumn[];
  cards?: T[];
  defaultCards?: T[];
  onCardsChange?: (cards: T[]) => void;
  /** The card's own content; the board adds the status chip and value under it. */
  renderCard: (card: T, state: { column: KanbanColumn; lifted: boolean }) => React.ReactNode;
  /** How a card is named when announced. */
  cardLabel?: (card: T) => string;
  /** A reason a column won't take a card, or nothing. Limits are checked for you. */
  refuse?: (card: T, column: KanbanColumn) => string | null | undefined | void;
  /** A card moved. Throw to fly it back. */
  onMove?: (card: T, to: KanbanColumn, index: number) => Promise<void> | void;
  /** Each card's amount: shown on the card and totalled in its column. */
  value?: (card: T) => number | null | undefined;
  valueFormat?: Intl.NumberFormatOptions;
  locales?: string;
  /** Shows "+ Add …" at the foot of each column. Return the new card (or a promise of it). */
  onAdd?: (column: KanbanColumn, title: string) => T | void | Promise<T | void>;
  /** The noun in "+ Add …". */
  addLabel?: string;
  label?: string;
}

type Snapshot = Map<string, { x: number; y: number; transform: string }>;

const EASE = "cubic-bezier(0.16,1,0.3,1)";
const THROW = "cubic-bezier(0.34,1.36,0.64,1)";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const COL_W = 268;
const COLLAPSED_W = 48;

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  React.useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);

const tint = (tone: number, amount: number) => `color-mix(in oklab, var(--chart-${tone}) ${amount}%, var(--background))`;
const ink = (tone: number) => `color-mix(in oklab, var(--chart-${tone}) 72%, var(--foreground))`;

/** The card's status: the column it's in, or (while carried) the column it's over. */
function Chip({ column, reduced }: { column: KanbanColumn; reduced: boolean }) {
  const tone = column.tone ?? 1;
  const t = reduced ? "none" : `color 300ms ${EASE}, background-color 300ms ${EASE}, box-shadow 300ms ${EASE}`;
  return (
    <span
      className="inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[11px] font-medium"
      style={{ color: ink(tone), background: tint(tone, 12), boxShadow: `inset 0 0 0 1px color-mix(in oklab, var(--chart-${tone}) 30%, transparent)`, transition: t }}
    >
      <span className="relative flex size-3 items-center justify-center" aria-hidden="true">
        <span className="absolute size-1.5 rounded-full bg-current" style={{ opacity: column.done ? 0 : 1, transform: column.done ? "scale(0.4)" : "none", transition: t === "none" ? t : `opacity 200ms ${EASE}, transform 300ms ${EASE}` }} />
        <svg viewBox="0 0 16 16" className="absolute size-3" fill="none">
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} style={{ strokeDashoffset: column.done ? 0 : 1, transition: reduced ? "none" : `stroke-dashoffset 380ms ${EASE} ${column.done ? 80 : 0}ms` }} />
        </svg>
      </span>
      <TextMorph>{column.title}</TextMorph>
    </span>
  );
}

/** A sentence that changes crossfades whole. */
function Line({ text, className = "" }: { text: string; className?: string }) {
  const [shown, setShown] = React.useState({ text, key: 0 });
  const [leaving, setLeaving] = React.useState<{ text: string; key: number }[]>([]);
  if (text !== shown.text) {
    if (shown.text) setLeaving((l) => [...l, shown]);
    setShown({ text, key: shown.key + 1 });
  }
  return (
    <span className={`relative block ${className}`}>
      <span
        key={shown.key}
        className="block"
        ref={(el) => {
          if (!el || shown.key === 0 || el.dataset.in) return;
          el.dataset.in = "1";
          el.animate(
            [
              { opacity: 0, transform: "translateY(0.35em)", filter: "blur(4px)" },
              { opacity: 1, transform: "none", filter: "blur(0px)" },
            ],
            { duration: 380, delay: 60, easing: EASE, fill: "backwards" },
          );
        }}
      >
        {shown.text || " "}
      </span>
      {leaving.map((l) => (
        <span
          key={l.key}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 block"
          ref={(el) => {
            if (!el || el.dataset.out) return;
            el.dataset.out = "1";
            el.animate(
              [
                { opacity: 1, filter: "blur(0px)" },
                { opacity: 0, filter: "blur(4px)" },
              ],
              { duration: 180, easing: EASE, fill: "forwards" },
            ).onfinish = () => setLeaving((all) => all.filter((x) => x.key !== l.key));
          }}
        >
          {l.text}
        </span>
      ))}
    </span>
  );
}

type CardActions<T> = {
  key: (e: React.KeyboardEvent, card: T) => void;
  blur: (card: T) => void;
  render: (card: T, state: { column: KanbanColumn; lifted: boolean }) => React.ReactNode;
};

/** One card, memoised on plain values: a carried card crossing a slot re-renders only the cards it changes. */
function BoardCardView<T extends KanbanCard>({
  card,
  column,
  lifted,
  label,
  amount,
  keysId,
  reduced,
  actions,
}: {
  card: T;
  column: KanbanColumn;
  lifted: boolean;
  label: string;
  amount: string | null;
  keysId: string;
  reduced: boolean;
  actions: React.RefObject<CardActions<T>>;
}) {
  return (
    <li
      data-card-id={card.id}
      tabIndex={0}
      aria-roledescription="draggable card"
      aria-label={label}
      aria-describedby={keysId}
      data-lifted={lifted || undefined}
      onKeyDown={(e) => actions.current.key(e, card)}
      onBlur={() => actions.current.blur(card)}
      className={`group/card relative cursor-grab select-none rounded-[12px] outline-none data-[lifted]:cursor-grabbing ${FOCUS}`}
    >
      <div
        className={`rounded-[12px] bg-background p-3 transition-[box-shadow] duration-200 ${
          lifted
            ? "shadow-[inset_0_0_0_1.5px_var(--ring)]"
            : "shadow-[inset_0_0_0_1px_var(--border)] group-data-[lifted]/card:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_34%,transparent)]"
        }`}
      >
        {actions.current.render(card, { column, lifted })}
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <Chip column={column} reduced={reduced} />
          {amount != null && <span className="text-[12px] tabular-nums text-muted-foreground">{amount}</span>}
        </div>
      </div>
    </li>
  );
}

const BoardCard = React.memo(BoardCardView) as typeof BoardCardView;

export function KanbanBoard<T extends KanbanCard>({
  columns,
  cards: controlled,
  defaultCards,
  onCardsChange,
  renderCard,
  cardLabel = (c) => c.id,
  refuse,
  onMove,
  value,
  valueFormat,
  locales,
  onAdd,
  addLabel = "card",
  label = "Board",
  className = "",
  ...props
}: KanbanBoardProps<T>) {
  const reduced = useReducedMotion();
  const uid = React.useId();
  const [own, setOwn] = React.useState<T[]>(defaultCards ?? []);
  const cards = controlled ?? own;
  const cardsRef = React.useRef(cards);
  cardsRef.current = cards;
  const [over, setOver] = React.useState<BoardOver | null>(null);
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set());
  const [adding, setAdding] = React.useState<string | null>(null);
  const [keyLift, setKeyLift] = React.useState<{ id: string; column: string; index: number } | null>(null);
  const [notes, setNotes] = React.useState<Record<string, { text: string; tone: "warn" | "error"; key: number }>>({});
  const [announce, setAnnounce] = React.useState("");
  const [flipTick, setFlipTick] = React.useState(0);
  const boardRef = React.useRef<HTMLDivElement>(null);
  const flip = React.useRef<{ before: Snapshot; lifted?: string } | null>(null);

  const say = (text: string) => setAnnounce((a) => (a === text ? `${text} ` : text));
  const commit = (next: T[]) => {
    cardsRef.current = next;
    if (controlled === undefined) setOwn(next);
    onCardsChange?.(next);
  };
  const note = (column: string, text: string, tone: "warn" | "error") => {
    const key = Date.now();
    setNotes((n) => ({ ...n, [column]: { text, tone, key } }));
    window.setTimeout(() => setNotes((n) => (n[column]?.key === key ? Object.fromEntries(Object.entries(n).filter(([k]) => k !== column)) : n)), 3200);
  };

  const colOf = (id: string) => columns.find((c) => c.id === id)!;
  const inColumn = (list: T[], column: string) => list.filter((c) => c.column === column);
  const fmt = React.useMemo(() => new Intl.NumberFormat(locales, valueFormat), [locales, valueFormat && JSON.stringify(valueFormat)]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Why `card` can't go into `column`: the limit, then the caller's rule. */
  const reason = (card: T, column: KanbanColumn) => {
    if (card.column === column.id) return null;
    if (column.limit !== undefined && inColumn(cardsRef.current, column.id).length >= column.limit) return `${column.title} holds ${column.limit} at most`;
    return (refuse?.(card, column) as string | null | undefined) || null;
  };

  /** Moves a card in the list: out of where it is, into column at index (among that column's cards). */
  const placed = (list: T[], id: string, column: string, index: number) => {
    const card = list.find((c) => c.id === id)!;
    const rest = list.filter((c) => c.id !== id);
    const moved = { ...card, column } as T;
    const peers = rest.filter((c) => c.column === column);
    if (index >= peers.length) {
      const last = peers[peers.length - 1];
      const at = last ? rest.indexOf(last) + 1 : rest.length;
      return [...rest.slice(0, at), moved, ...rest.slice(at)];
    }
    const at = rest.indexOf(peers[index]);
    return [...rest.slice(0, at), moved, ...rest.slice(at)];
  };

  // ── FLIP after any change of place ─────────────────────
  const engine = useBoardDrag({
    board: boardRef,
    refuse: (id, column) => {
      if (collapsed.has(column)) return null;
      const card = cardsRef.current.find((c) => c.id === id);
      return card ? reason(card, colOf(column)) : null;
    },
    onOver: setOver,
    onDrop: (id, column, index) => {
      const card = cardsRef.current.find((c) => c.id === id);
      if (!card) return;
      move(card, column, index, true);
    },
    onCancel: (id, refused, column) => {
      if (!refused) return;
      // The reason stays a moment after the card springs home.
      if (column) note(column, refused, "warn");
      const card = cardsRef.current.find((c) => c.id === id);
      say(`${card ? cardLabel(card) : "The card"} went back. ${refused}.`);
    },
    reduced,
    disabled: !!keyLift || !!adding,
  });

  const play = React.useCallback(() => {
    const f = flip.current;
    const board = boardRef.current;
    if (!f || !board) return;
    flip.current = null;
    engine.clear();
    if (reduced) return;
    board.querySelectorAll<HTMLElement>("[data-card-id]").forEach((el) => {
      const id = el.dataset.cardId!;
      const was = f.before.get(id);
      if (!was) return;
      const r = el.getBoundingClientRect();
      const dx = was.x - (r.left + r.width / 2);
      const dy = was.y - (r.top + r.height / 2);
      const tilt = Number(/rotate\(([-\d.]+)deg\)/.exec(was.transform)?.[1] ?? 0);
      const lifted = !!was.transform;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && !lifted) return;
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px) rotate(${tilt}deg) scale(${lifted ? 1.03 : 1})`, zIndex: lifted ? 50 : 1 }, { transform: "none", zIndex: lifted ? 50 : 1 }],
        { duration: lifted ? 460 : 380, easing: lifted ? THROW : EASE },
      );
    });
  }, [engine, reduced]);

  React.useLayoutEffect(() => {
    play();
  }, [flipTick, cards, play]);

  /** Commits a move (optimistic), FLIPs everything into place, then saves; a failed save flies it back. */
  const move = async (card: T, column: string, index: number, save: boolean) => {
    const before = engine.snapshot();
    const previous = cardsRef.current;
    const next = placed(previous, card.id, column, index);
    flip.current = { before };
    commit(next);
    setFlipTick((t) => t + 1);
    const to = colOf(column);
    const position = inColumn(next, column).findIndex((c) => c.id === card.id) + 1;
    const of = `${position} of ${inColumn(next, column).length}`;
    say(save ? `Moved ${cardLabel(card)} to ${to.title}, ${of}.` : `${cardLabel(card)}, ${to.title}, ${of}.`);
    if (!save || !onMove) return;
    try {
      await onMove({ ...card, column } as T, to, position - 1);
    } catch {
      // Back where it came from, from wherever it is now.
      flip.current = { before: engine.snapshot() };
      const restored = placed(cardsRef.current, card.id, card.column, inColumn(previous, card.column).findIndex((c) => c.id === card.id));
      commit(restored);
      setFlipTick((t) => t + 1);
      note(card.column, `Couldn't move ${cardLabel(card)}. It's back.`, "error");
      say(`Couldn't move ${cardLabel(card)}. It's back in ${colOf(card.column).title}.`);
      window.setTimeout(() => {
        if (reduced) return;
        boardRef.current?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(card.id)}"] > div`)?.animate(
          [{ transform: "none" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "none" }],
          { duration: 380, easing: "ease-out" },
        );
      }, 420);
    }
  };

  // ── Keys: Space picks up, arrows carry, Space drops, Escape puts back ──
  const onCardKey = (e: React.KeyboardEvent, card: T) => {
    const list = inColumn(cardsRef.current, card.column);
    const index = list.findIndex((c) => c.id === card.id);
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (keyLift?.id === card.id) {
        const from = keyLift;
        setKeyLift(null);
        if (from.column !== card.column || from.index !== index) {
          // The carrying already showed the move; this saves it.
          const original = { ...card, column: from.column } as T;
          say(`Dropped ${cardLabel(card)} in ${colOf(card.column).title}, ${index + 1} of ${list.length}.`);
          if (onMove)
            Promise.resolve()
              .then(() => onMove(card, colOf(card.column), index))
              .catch(() => {
                flip.current = { before: engine.snapshot() };
                commit(placed(cardsRef.current, card.id, from.column, from.index));
                setFlipTick((t) => t + 1);
                note(from.column, `Couldn't move ${cardLabel(original)}. It's back.`, "error");
                say(`Couldn't move ${cardLabel(original)}. It's back.`);
              });
        } else say(`Dropped ${cardLabel(card)} where it was.`);
      } else {
        setKeyLift({ id: card.id, column: card.column, index });
        say(`Picked up ${cardLabel(card)}, ${colOf(card.column).title}, ${index + 1} of ${list.length}. Arrow keys carry it, Space drops it, Escape puts it back.`);
      }
      return;
    }
    if (keyLift?.id !== card.id) return;
    const ci = columns.findIndex((c) => c.id === card.column);
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const to = index + (e.key === "ArrowUp" ? -1 : 1);
      if (to < 0 || to >= list.length) return;
      move(card, card.column, to, false);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dir = e.key === "ArrowLeft" ? -1 : 1;
      for (let j = ci + dir; j >= 0 && j < columns.length; j += dir) {
        const col = columns[j];
        const why = reason(card, col);
        if (why) {
          note(col.id, why, "warn");
          say(`${col.title} won't take it: ${why}.`);
          return;
        }
        move(card, col.id, Math.min(index, inColumn(cardsRef.current, col.id).length), false);
        return;
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setKeyLift(null);
      move(card, keyLift.column, keyLift.index, false);
      say(`Put ${cardLabel(card)} back.`);
    }
  };

  // Keep focus on the carried card as it moves between columns (it's a new element there), before anything paints.
  React.useLayoutEffect(() => {
    if (!keyLift) return;
    boardRef.current?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(keyLift.id)}"]`)?.focus({ preventScroll: false });
  }, [cards, keyLift]);

  // ── Adding ─────────────────────────────────────────────
  const add = async (column: KanbanColumn, title: string) => {
    setAdding(null);
    if (!title.trim() || !onAdd) return;
    try {
      const made = await onAdd(column, title.trim());
      if (made) {
        commit([...cardsRef.current, made]);
        say(`Added ${cardLabel(made)} to ${column.title}.`);
      }
    } catch {
      note(column.id, `Couldn't add “${title.trim()}”.`, "error");
    }
  };

  // What the memoised cards call, through one ref, so a card never re-renders just because these were re-created.
  const cardActions = React.useRef<CardActions<T>>(null!);
  cardActions.current = {
    key: onCardKey,
    blur: (card) => {
      // A carried card moving column is a new element for a moment: only a real blur drops the carry.
      if (keyLift?.id !== card.id) return;
      requestAnimationFrame(() => !boardRef.current?.contains(document.activeElement) && setKeyLift(null));
    },
    render: renderCard,
  };

  // ── Render ─────────────────────────────────────────────
  // While a card is carried, it counts in the column it's over (unless that column refuses it).
  const carried = over && !over.refused ? cards.find((c) => c.id === over.card) : undefined;
  const effective = (c: T) => (carried && c.id === carried.id ? over!.column : c.column);
  const total = (column: string) => cards.filter((c) => effective(c) === column).reduce((sum, c) => sum + (value?.(c) ?? 0), 0);
  const count = (column: string) => cards.filter((c) => effective(c) === column).length;

  return (
    <div className={`@container w-full text-foreground ${className}`} {...props}>
      <div
        ref={boardRef}
        role="region"
        aria-label={label}
        aria-describedby={`${uid}-how`}
        {...engine.handlers}
        className="-mx-1 overflow-x-auto overscroll-x-contain px-1 pb-3 [scrollbar-width:thin] @max-[40rem]:snap-x @max-[40rem]:snap-mandatory"
      >
        <div className="flex w-max items-start gap-3">
          {columns.map((column) => {
            const tone = column.tone ?? 1;
            const list = inColumn(cards, column.id);
            const isCollapsed = collapsed.has(column.id);
            const n = count(column.id);
            const full = column.limit !== undefined && n >= column.limit;
            const refusedHere = over?.refused && over.column === column.id;
            const hereNote = notes[column.id];
            const showNote = refusedHere ? { text: over!.refused!, tone: "warn" as const } : hereNote;
            return (
              <section
                key={column.id}
                data-column-id={column.id}
                aria-label={`${column.title}, ${n} ${n === 1 ? "card" : "cards"}${value ? `, ${fmt.format(total(column.id))}` : ""}`}
                className={`relative shrink-0 snap-start rounded-[18px] border border-border transition-[width] duration-[420ms] ${isCollapsed ? "overflow-hidden" : "@max-[40rem]:!w-[min(82cqw,300px)]"}`}
                style={{ width: isCollapsed ? COLLAPSED_W : COL_W, transitionTimingFunction: EASE, background: "color-mix(in oklab, var(--muted) 45%, var(--background))" }}
              >
                {/* Taking the card (its tint) or refusing it (amber): layers that only fade, so nothing repaints mid-carry. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-px rounded-[18px]"
                  style={{
                    background: tint(tone, 5),
                    boxShadow: `inset 0 0 0 1px color-mix(in oklab, var(--chart-${tone}) 45%, transparent)`,
                    opacity: over && !over.refused && over.column === column.id ? 1 : 0,
                    transition: reduced ? "none" : `opacity 300ms ${EASE}`,
                  }}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-px rounded-[18px]"
                  style={{ boxShadow: "inset 0 0 0 1px color-mix(in oklab, #f59e0b 60%, transparent)", opacity: refusedHere ? 1 : 0, transition: reduced ? "none" : `opacity 240ms ${EASE}` }}
                />
                <div className="relative">
                {/* Head: title, count (of the limit), total; it gives a shake when it refuses a card. */}
                <header data-column-head className={`flex h-11 items-center gap-2 ps-3 pe-1.5 ${isCollapsed ? "flex-col justify-start !h-auto gap-3 px-0 py-3" : ""}`}>
                  {isCollapsed ? (
                    <>
                      <button type="button" aria-label={`Open ${column.title}`} aria-expanded={false} onClick={() => setCollapsed((s) => new Set([...s].filter((x) => x !== column.id)))} className={`flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground ${FOCUS}`}>
                        <UnfoldHorizontal className="size-3.5" strokeWidth={1.75} />
                      </button>
                      <span className="text-[12px] tabular-nums text-muted-foreground">
                        <NumberRoll value={n} />
                      </span>
                      <span className="text-[13px] font-medium [writing-mode:vertical-rl]">{column.title}</span>
                    </>
                  ) : (
                    <>
                      <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--chart-${tone})` }} aria-hidden="true" />
                      <h3 className="min-w-0 truncate text-[13.5px] font-medium tracking-[-0.01em]">{column.title}</h3>
                      <span
                        className={`inline-flex h-5 shrink-0 items-center rounded-full px-1.5 text-[11.5px] tabular-nums transition-colors duration-300 ${full ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
                        style={{ boxShadow: "inset 0 0 0 1px var(--border)" }}
                      >
                        <NumberRoll value={n} />
                        {column.limit !== undefined && <span>/{column.limit}</span>}
                      </span>
                      {value && (
                        <span className="ms-auto truncate text-[12px] tabular-nums text-muted-foreground">
                          <NumberRoll value={total(column.id)} format={valueFormat} locales={locales} duration={800} />
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={`Collapse ${column.title}`}
                        aria-expanded
                        onClick={() => setCollapsed((s) => new Set([...s, column.id]))}
                        className={`flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground ${value ? "" : "ms-auto"} ${FOCUS}`}
                      >
                        <FoldHorizontal className="size-3.5" strokeWidth={1.75} />
                      </button>
                    </>
                  )}
                </header>

                {!isCollapsed && (
                  <div className="grid transition-[grid-template-rows] duration-300" style={{ gridTemplateRows: showNote ? "1fr" : "0fr", transitionTimingFunction: EASE }}>
                    <div className="min-h-0 overflow-hidden">
                      <Line text={showNote?.text ?? ""} className={`px-3 pb-2 text-[12px] ${showNote?.tone === "error" ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`} />
                    </div>
                  </div>
                )}

                <ol
                  data-column-list
                  data-collapsed={isCollapsed || undefined}
                  aria-label={column.title}
                  className={`relative flex min-h-12 flex-col gap-2 px-2 pb-2 ${isCollapsed ? "hidden" : ""}`}
                >
                  {list.map((card) => {
                    const shownColumn = colOf(over?.card === card.id && !over.refused ? over.column : card.column);
                    const amount = value?.(card);
                    return (
                      <BoardCard
                        key={card.id}
                        card={card}
                        column={shownColumn}
                        lifted={keyLift?.id === card.id}
                        label={`${cardLabel(card)}, ${column.title}, ${list.indexOf(card) + 1} of ${list.length}${amount != null ? `, ${fmt.format(amount)}` : ""}`}
                        amount={amount != null ? fmt.format(amount) : null}
                        keysId={`${uid}-keys`}
                        reduced={reduced}
                        actions={cardActions}
                      />
                    );
                  })}
                </ol>

                {/* "+ Add …" grows into a card you type into, and folds back. */}
                {onAdd && !isCollapsed && (
                  <div className="px-2 pb-2">
                    <div
                      className="grid rounded-[12px] transition-[background-color,box-shadow] duration-300"
                      style={{ background: adding === column.id ? "var(--background)" : "transparent", boxShadow: adding === column.id ? "inset 0 0 0 1px var(--ring)" : "inset 0 0 0 1px transparent" }}
                    >
                      <button
                        type="button"
                        onClick={() => setAdding(column.id)}
                        className={`col-start-1 row-start-1 flex h-9 cursor-pointer items-center gap-1.5 rounded-[12px] px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${FOCUS}`}
                        style={{ opacity: adding === column.id ? 0 : 1, pointerEvents: adding === column.id ? "none" : undefined, transition: reduced ? "none" : `opacity 200ms ${EASE}` }}
                        tabIndex={adding === column.id ? -1 : 0}
                      >
                        <Plus className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                        Add {addLabel}
                      </button>
                      <div
                        className="col-start-1 row-start-1 grid transition-[grid-template-rows] duration-[380ms]"
                        style={{ gridTemplateRows: adding === column.id ? "1fr" : "0fr", transitionTimingFunction: EASE, pointerEvents: adding === column.id ? undefined : "none" }}
                      >
                        <div className="min-h-0 overflow-hidden">
                          {adding === column.id && (
                            <input
                              autoFocus
                              placeholder={`New ${addLabel}`}
                              aria-label={`New ${addLabel} in ${column.title}`}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") add(column, e.currentTarget.value);
                                if (e.key === "Escape") setAdding(null);
                              }}
                              onBlur={(e) => add(column, e.currentTarget.value)}
                              className="h-[60px] w-full bg-transparent px-3 text-[13px] outline-none placeholder:text-muted-foreground [@media(pointer:coarse)]:text-[16px]"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <p id={`${uid}-how`} className="sr-only">
        Drag a card to another column or place. On a touch screen, hold it first.
      </p>
      <p id={`${uid}-keys`} className="sr-only">
        Space picks the card up, arrow keys carry it within and across columns, Space drops it, Escape puts it back.
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
