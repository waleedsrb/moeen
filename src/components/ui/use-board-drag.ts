// Hairline UI · kanban-board · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

"use client";

import * as React from "react";

/* ─────────────────────────────────────────────────────────
 * BOARD DRAG: a card you pick up and carry across columns
 *
 *   lift      after 4px (or a hold on touch) the card itself
 *             follows the pointer exactly, a touch larger, and
 *             tilts with how fast you're carrying it sideways,
 *             settling upright when you stop
 *   gaps      the column under it eases open a gap at the exact
 *             slot while the one it left closes its own; all
 *             transforms, nothing re-laid out per move
 *   refuse    a column that won't take the card (a limit, a
 *             rule) opens no gap; let go and it springs home
 *   scroll    near the board's sides it scrolls sideways, near
 *             the window's top or bottom the page scrolls
 *
 * The hook reports the column and slot only when they change;
 * the component re-renders for those (the card's status chip,
 * the column totals) and runs its own FLIP on drop. Elements:
 * data-column-id (a column), data-column-list (its list),
 * data-card-id (a card's list item).
 * ───────────────────────────────────────────────────────── */

export type BoardOver = { card: string; column: string; index: number; refused: string | null };

type Options = {
  board: React.RefObject<HTMLElement | null>;
  /** Why a card can't go in a column, or null. */
  refuse: (card: string, column: string) => string | null;
  onOver: (over: BoardOver | null) => void;
  /** Dropped on a slot. The card's tilt and lift are on its element still; FLIP from there. */
  onDrop: (card: string, column: string, index: number) => void;
  /** Dropped where it can't go (and which column refused it), or not moved: it's sprung home already. */
  onCancel: (card: string, refused: string | null, column: string | null) => void;
  reduced: boolean;
  disabled?: boolean;
};

type ColumnBox = { id: string; left: number; right: number; listTop: number; list: HTMLElement; collapsed: boolean; cards: { id: string; el: HTMLElement; top: number; height: number }[] };

const EASE = "cubic-bezier(0.16,1,0.3,1)";
const THROW = "cubic-bezier(0.34,1.36,0.64,1)";
const GAP = 8;
const HOLD = 300;
const EDGE = 48;

export function useBoardDrag(o: Options) {
  const opts = React.useRef(o);
  opts.current = o;
  const drag = React.useRef<{
    id: string;
    pointerId: number;
    pointerType: string;
    el: HTMLElement;
    from: string;
    fromIndex: number;
    x0: number;
    y0: number;
    x: number;
    y: number;
    scroll0: number;
    page0: number;
    gap: number;
    columns: ColumnBox[];
    over: { column: string; index: number; refused: string | null } | null;
    active: boolean;
    timer: number;
    vx: number;
    lastX: number;
    lastT: number;
    tilt: number;
    /** The board's box at pickup: only its left and right are needed, and page scrolling doesn't move those. */
    left: number;
    right: number;
    /** The carried card's laid-out centre in its own list, read once at pickup so moves never force a layout. */
    home: number;
  } | null>(null);
  const loop = React.useRef(0);
  /** Scroll positions kept from scroll events: reading scrollLeft or scrollY mid-carry would force a layout every frame. */
  const scroll = React.useRef({ left: 0, top: 0 });

  const write = () => {
    const d = drag.current;
    if (!d) return;
    const dx = d.x - d.x0 + (scroll.current.left - d.scroll0);
    const dy = d.y - d.y0 + (scroll.current.top - d.page0);
    d.el.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${d.tilt}deg) scale(1.03)`;
  };

  /** One loop while carrying: eases the tilt toward the carrying speed and back to upright when still. */
  const run = () => {
    cancelAnimationFrame(loop.current);
    const tick = () => {
      const d = drag.current;
      if (!d?.active) return;
      const now = performance.now();
      if (now - d.lastT > 60) d.vx *= 0.8;
      const target = opts.current.reduced ? 0 : Math.max(-5, Math.min(5, d.vx * 3.2));
      d.tilt += (target - d.tilt) * 0.18;
      write();
      autoScroll();
      loop.current = requestAnimationFrame(tick);
    };
    loop.current = requestAnimationFrame(tick);
  };

  const measure = (skip: string): ColumnBox[] => {
    const board = opts.current.board.current;
    if (!board) return [];
    return [...board.querySelectorAll<HTMLElement>("[data-column-id]")].map((col) => {
      const r = col.getBoundingClientRect();
      const list = col.querySelector<HTMLElement>("[data-column-list]")!;
      const lr = list.getBoundingClientRect();
      return {
        id: col.dataset.columnId!,
        left: r.left,
        right: r.right,
        listTop: lr.top,
        list,
        collapsed: list.hasAttribute("data-collapsed"),
        cards: [...list.querySelectorAll<HTMLElement>(":scope > [data-card-id]")]
          .filter((el) => el.dataset.cardId !== skip)
          .map((el) => ({ id: el.dataset.cardId!, el, top: el.offsetTop, height: el.offsetHeight })),
      };
    });
  };

  /** Which column and slot the card's centre is over (screen positions, adjusted for any scrolling since pickup). */
  const locate = () => {
    const d = drag.current!;
    const sx = scroll.current.left - d.scroll0;
    const sy = scroll.current.top - d.page0;
    const cols = d.columns;
    let col = cols.find((c) => d.x >= c.left - sx && d.x <= c.right - sx);
    if (!col) col = cols.reduce((best, c) => (Math.abs((c.left + c.right) / 2 - sx - d.x) < Math.abs((best.left + best.right) / 2 - sx - d.x) ? c : best), cols[0]);
    // The carried card's centre (its laid-out centre plus how far it's been carried), in the target list's coordinates.
    const home = d.columns.find((c) => c.id === d.from)!;
    const cardCentre = d.home + (d.y - d.y0) + sy + (home.listTop - col.listTop);
    // A collapsed column shows no cards: it takes the card at its end.
    if (col.collapsed) return { column: col.id, index: col.cards.length };
    let index = 0;
    for (const c of col.cards) if (cardCentre > c.top + c.height / 2) index++;
    return { column: col.id, index };
  };

  const shift = (el: HTMLElement, y: number) => {
    el.style.transition = opts.current.reduced ? "none" : `transform 240ms ${EASE}`;
    el.style.transform = y ? `translate3d(0, ${y}px, 0)` : "";
  };

  /** Open the gap where the card would land and close the one it left. */
  const arrange = () => {
    const d = drag.current!;
    const { column, index } = locate();
    const refused = column === d.from ? null : opts.current.refuse(d.id, column);
    if (d.over && d.over.column === column && d.over.index === index && d.over.refused === refused) return;
    if ((!d.over || d.over.column !== column) && refused) {
      // Entering a column that won't take it: its head says no once.
      const head = d.columns.find((c) => c.id === column)?.list.parentElement?.querySelector<HTMLElement>("[data-column-head]");
      if (head && !opts.current.reduced)
        head.animate([{ transform: "none" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "none" }], { duration: 380, easing: "ease-out" });
    }
    d.over = { column, index, refused };
    for (const c of d.columns) {
      const lands = !refused && c.id === column;
      const left = c.id === d.from;
      c.cards.forEach((card, i) => {
        let y = 0;
        if (left && !(lands && column === d.from)) {
          // The column it left closes up behind it.
          if (i >= d.fromIndex) y = -d.gap;
        }
        if (lands) {
          if (column === d.from) {
            // Same column: the cards between the old and new slot make way.
            if (index > d.fromIndex && i >= d.fromIndex && i < index) y = -d.gap;
            if (index < d.fromIndex && i >= index && i < d.fromIndex) y = d.gap;
          } else if (i >= index) y = d.gap;
        }
        if (card.el.style.transform !== (y ? `translate3d(0, ${y}px, 0)` : "")) shift(card.el, y);
      });
      // The column it would land in grows by a card; the one it left keeps its height until the drop.
      c.list.style.transition = opts.current.reduced ? "none" : `padding-bottom 240ms ${EASE}`;
      c.list.style.paddingBottom = lands && column !== d.from ? `${d.gap}px` : "";
    }
    opts.current.onOver({ card: d.id, column, index: refused ? -1 : index, refused });
  };

  const autoScroll = () => {
    const d = drag.current;
    const board = opts.current.board.current;
    if (!d?.active || !board) return;
    const sideways = d.x < d.left + EDGE ? -(d.left + EDGE - d.x) / EDGE : d.x > d.right - EDGE ? (d.x - (d.right - EDGE)) / EDGE : 0;
    const upDown = d.y < EDGE ? -(EDGE - d.y) / EDGE : d.y > window.innerHeight - EDGE ? (d.y - (window.innerHeight - EDGE)) / EDGE : 0;
    // Scroll without reading back: the scroll events update the cached positions before the next frame re-arranges.
    if (sideways) board.scrollLeft = scroll.current.left + sideways * 14;
    if (upDown) window.scrollBy(0, upDown * 12);
    if (sideways || upDown) arrange();
  };

  /** Puts everything back where it was laid out (the card springs home unless asked not to). */
  const release = (home: boolean) => {
    const d = drag.current;
    if (!d) return;
    for (const c of d.columns) {
      c.cards.forEach((card) => {
        shift(card.el, 0);
        card.el.style.willChange = "";
      });
      c.list.style.paddingBottom = "";
    }
    if (home) {
      const from = d.el.style.transform;
      d.el.style.transform = "";
      if (from && !opts.current.reduced) d.el.animate([{ transform: from }, { transform: "none" }], { duration: 460, easing: THROW });
    }
    d.el.style.zIndex = "";
    d.el.style.willChange = "";
    d.el.removeAttribute("data-lifted");
  };

  const activate = () => {
    const d = drag.current;
    if (!d || d.active) return;
    d.active = true;
    if (d.pointerType === "touch") navigator.vibrate?.(8);
    d.columns = measure(d.id);
    d.gap = d.el.offsetHeight + GAP;
    d.home = d.el.offsetTop + d.el.offsetHeight / 2;
    d.el.style.transition = "none";
    d.el.style.zIndex = "50";
    d.el.style.willChange = "transform";
    // Snapping would pull every small auto-scroll step straight back; it's off while a card is carried.
    const board = opts.current.board.current;
    if (board) {
      board.style.scrollSnapType = "none";
      const r = board.getBoundingClientRect();
      d.left = r.left;
      d.right = r.right;
      // Every card that may make way gets its own layer now, once, rather than one by one as each starts to move.
      board.querySelectorAll<HTMLElement>("[data-card-id]").forEach((el) => (el.style.willChange = "transform"));
    }
    d.el.setAttribute("data-lifted", "");
    arrange();
    run();
  };

  const end = (dropped: boolean) => {
    const d = drag.current;
    if (!d) return;
    window.clearTimeout(d.timer);
    cancelAnimationFrame(loop.current);
    const board = opts.current.board.current;
    if (board) board.style.scrollSnapType = "";
    if (!d.active) {
      drag.current = null;
      return;
    }
    const over = d.over;
    const moved = over && (over.column !== d.from || over.index !== d.fromIndex);
    if (dropped && over && !over.refused && moved) {
      // The component re-lays the board out and runs the FLIP from where everything is now.
      opts.current.onDrop(d.id, over.column, over.index);
      drag.current = null;
      opts.current.onOver(null);
      return;
    }
    release(true);
    drag.current = null;
    opts.current.onOver(null);
    opts.current.onCancel(d.id, dropped && over?.refused ? over.refused : null, over?.column ?? null);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (opts.current.disabled || drag.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, textarea, [data-no-drag]")) return;
    const el = target.closest<HTMLElement>("[data-card-id]");
    if (!el) return;
    const column = el.closest<HTMLElement>("[data-column-id]")!.dataset.columnId!;
    const siblings = [...el.parentElement!.querySelectorAll<HTMLElement>(":scope > [data-card-id]")];
    drag.current = {
      id: el.dataset.cardId!,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      el,
      from: column,
      fromIndex: siblings.indexOf(el),
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      scroll0: (scroll.current.left = opts.current.board.current?.scrollLeft ?? 0),
      page0: (scroll.current.top = window.scrollY),
      gap: 0,
      columns: [],
      over: null,
      active: false,
      timer: 0,
      vx: 0,
      lastX: e.clientX,
      lastT: performance.now(),
      tilt: 0,
      left: 0,
      right: 0,
      home: 0,
    };
    if (e.pointerType === "touch") {
      drag.current.timer = window.setTimeout(activate, HOLD);
    } else {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.active) {
      const moved = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
      if (d.pointerType === "touch") {
        if (moved > 8) end(false);
        return;
      }
      if (moved < 4) return;
      activate();
    }
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.vx = d.vx * 0.6 + ((e.clientX - d.lastX) / dt) * 0.4;
    d.lastX = e.clientX;
    d.lastT = now;
    d.x = e.clientX;
    d.y = e.clientY;
    arrange();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId === e.pointerId) end(true);
  };
  const onPointerCancel = (e: React.PointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId === e.pointerId) end(false);
  };

  // A held card on touch: the page mustn't scroll under it, and no context menu.
  React.useEffect(() => {
    const el = o.board.current;
    if (!el) return;
    const touchMove = (e: TouchEvent) => {
      if (drag.current?.active && e.cancelable) e.preventDefault();
    };
    const menu = (e: Event) => {
      if (drag.current) e.preventDefault();
    };
    const onBoard = () => {
      scroll.current.left = el.scrollLeft;
    };
    const onPage = () => {
      scroll.current.top = window.scrollY;
    };
    el.addEventListener("touchmove", touchMove, { passive: false });
    el.addEventListener("contextmenu", menu);
    el.addEventListener("scroll", onBoard, { passive: true });
    window.addEventListener("scroll", onPage, { passive: true });
    return () => {
      el.removeEventListener("touchmove", touchMove);
      el.removeEventListener("contextmenu", menu);
      el.removeEventListener("scroll", onBoard);
      window.removeEventListener("scroll", onPage);
    };
  }, [o.board]);

  React.useEffect(() => () => cancelAnimationFrame(loop.current), []);

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    /** Where every card is on screen right now (lifted and shifted ones included), for a FLIP after the drop. */
    snapshot: () => {
      const out = new Map<string, { x: number; y: number; transform: string }>();
      opts.current.board.current?.querySelectorAll<HTMLElement>("[data-card-id]").forEach((el) => {
        const r = el.getBoundingClientRect();
        out.set(el.dataset.cardId!, { x: r.left + r.width / 2, y: r.top + r.height / 2, transform: el.hasAttribute("data-lifted") ? el.style.transform : "" });
      });
      return out;
    },
    /** Clears what a drag left on the elements (shifts, the lift, list padding) so the new layout can be measured. */
    clear: () => {
      opts.current.board.current?.querySelectorAll<HTMLElement>("[data-card-id]").forEach((el) => {
        el.style.transition = "none";
        el.style.transform = "";
        el.style.zIndex = "";
        el.style.willChange = "";
        el.removeAttribute("data-lifted");
      });
      opts.current.board.current?.querySelectorAll<HTMLElement>("[data-column-list]").forEach((el) => {
        el.style.transition = "none";
        el.style.paddingBottom = "";
      });
    },
  };
}
