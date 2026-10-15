// Hairline UI · filter-bar · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

// Mo'een adaptation: physical spacing/position utilities switched to logical (RTL-safe) ones.
"use client";

import * as React from "react";
import { Check, ChevronLeft, ChevronRight, ListFilter, Plus, Sparkles, X } from "lucide-react";
import { NumberRoll } from "./number-roll";
import { TextMorph } from "./text-morph";

/* ─────────────────────────────────────────────────────────
 * FILTER BAR: the bar above a list, done like Linear's
 *
 *   add       "Filter" opens one panel: pick a property, its
 *             values slide in from the side, pick one and it
 *             lands in the bar as a chip
 *   search    typing searches properties and values at once:
 *             "hig" offers Priority › High straight away
 *   chip      Status | is | Todo | ×. Click "is" and it turns
 *             into "is not"; click the value to change it (the
 *             panel opens from the chip, values tick on and off)
 *   describe  with parse(), a sentence becomes filters: "high
 *             priority bugs from Maya" → three chips
 *   count     "37 of 128 issues" rolls as the filters change
 *
 * Filters are plain data ({ field, op, values | text | number |
 * days }), easy to turn into a query. matchFilters() applies
 * them to rows you already have. F opens the panel from anywhere
 * on the page while nothing is being typed.
 * ───────────────────────────────────────────────────────── */

export type FilterFieldType = "option" | "text" | "number" | "date";

export interface FilterOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface FilterField<T = unknown> {
  id: string;
  label: string;
  type: FilterFieldType;
  icon?: React.ReactNode;
  /** The values an option field can take. */
  options?: FilterOption[];
  /** A number field's unit, e.g. ["seat", "seats"]. */
  unit?: [string, string];
  /** Reads a row's value for matchFilters. Defaults to row[id]. */
  get?: (row: T) => string | string[] | number | Date | null | undefined;
}

export type Filter =
  | { id: string; field: string; op: "is" | "is not"; values: string[] }
  | { id: string; field: string; op: "contains" | "does not contain"; text: string }
  | { id: string; field: string; op: "at least" | "at most" | "is exactly"; number: number }
  | { id: string; field: string; op: "within" | "older than"; days: number };

type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A filter before it has an id: what parse() returns. */
export type NewFilter = Without<Filter, "id">;

export interface FilterBarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "defaultValue" | "onChange"> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fields: FilterField<any>[];
  value?: Filter[];
  defaultValue?: Filter[];
  onValueChange?: (filters: Filter[]) => void;
  /** How many rows match; it rolls beside the bar. */
  count?: number;
  /** How many there are in all: "37 of 128". */
  total?: number;
  /** What a row is called: ["issue", "issues"]. */
  noun?: [string, string];
  /** Turns a sentence into filters (with a model, say). Adds "Filter by “…”" to the panel; throw or return none to say it couldn't. */
  parse?: (text: string) => Promise<NewFilter[]> | NewFilter[];
  /** A key that opens the panel from anywhere on the page while nothing is being typed. null turns it off. */
  hotkey?: string | null;
  locales?: string;
  /** Accessible name of the bar. */
  label?: string;
}

type Menu = { mode: "new" } | { mode: "edit"; filter: string };
type Phase = "closed" | "opening" | "open" | "closing";
type Box = { left: number; top: number; width: number; height: number };
type Row =
  | { kind: "field"; field: FilterField }
  | { kind: "jump"; field: FilterField; option: FilterOption }
  | { kind: "option"; field: FilterField; option: FilterOption; checked: boolean }
  | { kind: "set"; field: FilterField; filter: NewFilter; label: string }
  | { kind: "parse"; text: string }
  | { kind: "hint"; text: string };

const EASE = "cubic-bezier(0.16,1,0.3,1)";
const UI = "cubic-bezier(0.23,1,0.32,1)";
const OPEN = 300;
const CLOSE = 220;
const PANEL_W = 268;
const ROW = 32;
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const NO_FILTERS: Filter[] = [];
const NOUN: [string, string] = ["result", "results"];
const DAY = 86_400_000;

const DATE_PRESETS: { op: "within" | "older than"; days: number; label: string }[] = [
  { op: "within", days: 1, label: "Last 24 hours" },
  { op: "within", days: 7, label: "Last 7 days" },
  { op: "within", days: 30, label: "Last 30 days" },
  { op: "within", days: 90, label: "Last 3 months" },
  { op: "older than", days: 30, label: "More than 30 days ago" },
  { op: "older than", days: 90, label: "More than 3 months ago" },
];

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  React.useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);

/** One of two icons in the same place: the other shrinks away through a blur. */
const swap = (on: boolean, reduced: boolean): React.CSSProperties => ({
  opacity: on ? 1 : 0,
  transform: on ? "none" : "scale(0.6)",
  filter: on ? "none" : "blur(3px)",
  transition: reduced ? "none" : `opacity 200ms ${EASE}, transform 320ms ${EASE}, filter 200ms ${EASE}`,
});

let seq = 0;
const newId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`;

const dayLabel = (d: number) =>
  d === 1 ? "1 day" : d % 365 === 0 ? `${d / 365} ${d === 365 ? "year" : "years"}` : d >= 60 && d % 30 === 0 ? `${d / 30} months` : `${d} days`;

const OPS: Record<FilterFieldType, Filter["op"][]> = {
  option: ["is", "is not"],
  text: ["contains", "does not contain"],
  number: ["at least", "at most", "is exactly"],
  date: ["within", "older than"],
};

/** The words a chip shows for a filter: "is any of", "Todo +2". */
function words(f: Filter | NewFilter, field: FilterField | undefined, num: Intl.NumberFormat) {
  if ("values" in f) {
    // In the field's own order, whatever order they were ticked in.
    const order = (v: string) => field?.options?.findIndex((o) => o.value === v) ?? 0;
    const values = [...f.values].sort((a, b) => order(a) - order(b));
    const labels = values.map((v) => field?.options?.find((o) => o.value === v)?.label ?? v);
    const op = labels.length > 1 ? (f.op === "is" ? "is any of" : "is none of") : f.op;
    const value = labels.length === 0 ? "nothing" : labels.length === 2 ? `${labels[0]}, ${labels[1]}` : labels.length > 2 ? `${labels[0]} +${labels.length - 1}` : labels[0];
    return { op, value, icon: field?.options?.find((o) => o.value === values[0])?.icon };
  }
  if ("text" in f) return { op: f.op === "contains" ? "contains" : "doesn't contain", value: `“${f.text}”`, icon: undefined };
  if ("number" in f) return { op: f.op, value: num.format(f.number), icon: undefined };
  return { op: f.op, value: dayLabel(f.days), icon: undefined };
}

/** Keeps the rows every filter allows. Filters on the same field and on different fields must all hold. */
export function matchFilters<T>(rows: T[], filters: Filter[], fields: FilterField<T>[], now = Date.now()): T[] {
  const live = filters.filter((f) => !("values" in f) || f.values.length);
  if (!live.length) return rows;
  const byId = new Map(fields.map((f) => [f.id, f]));
  return rows.filter((row) =>
    live.every((f) => {
      const field = byId.get(f.field);
      if (!field) return true;
      const raw = field.get ? field.get(row) : ((row as Record<string, unknown>)[field.id] as ReturnType<NonNullable<FilterField["get"]>>);
      switch (f.op) {
        case "is":
        case "is not": {
          const vals = Array.isArray(raw) ? raw.map(String) : raw == null ? [] : [String(raw)];
          const hit = vals.some((v) => f.values.includes(v));
          return f.op === "is" ? hit : !hit;
        }
        case "contains":
        case "does not contain": {
          const hit = String(raw ?? "").toLowerCase().includes(f.text.toLowerCase());
          return f.op === "contains" ? hit : !hit;
        }
        case "at least":
          return typeof raw === "number" && raw >= f.number;
        case "at most":
          return typeof raw === "number" && raw <= f.number;
        case "is exactly":
          return typeof raw === "number" && raw === f.number;
        case "within":
        case "older than": {
          const t = raw instanceof Date ? raw.getTime() : typeof raw === "string" || typeof raw === "number" ? new Date(raw).getTime() : NaN;
          if (Number.isNaN(t)) return false;
          return f.op === "within" ? t >= now - f.days * DAY : t < now - f.days * DAY;
        }
      }
    }),
  );
}

/** Adds a filter: a value joins an existing chip on the same field and operator, a number or date replaces its twin. */
function merge(list: Filter[], draft: NewFilter, added: string[]): Filter[] {
  const twin = list.find((f) => f.field === draft.field && f.op === draft.op);
  if (twin && "values" in twin && "values" in draft) {
    const values = [...twin.values, ...draft.values.filter((v) => !twin.values.includes(v))];
    return list.map((f) => (f === twin ? { ...twin, values } : f));
  }
  if (twin && !("values" in draft)) return list.map((f) => (f === twin ? ({ ...draft, id: twin.id } as Filter) : f));
  const id = newId();
  added.push(id);
  return [...list, { ...draft, id } as Filter];
}

/** Chips that keep their place on screen: positions taken at the click, glides after the new layout, leavers fade where they stood. */
function useChipMotion(list: React.RefObject<HTMLElement | null>, ghosts: React.RefObject<HTMLElement | null>, reduced: boolean) {
  const before = React.useRef<Map<string, { x: number; y: number; w: number; h: number; el: HTMLElement }> | null>(null);
  const capture = React.useCallback(() => {
    const el = list.current;
    if (!el) return;
    const o = el.getBoundingClientRect();
    const m = new Map<string, { x: number; y: number; w: number; h: number; el: HTMLElement }>();
    el.querySelectorAll<HTMLElement>("[data-chip]").forEach((c) => {
      const r = c.getBoundingClientRect();
      m.set(c.dataset.chip!, { x: r.left - o.left + el.scrollLeft, y: r.top - o.top, w: r.width, h: r.height, el: c });
    });
    before.current = m;
  }, [list]);

  const play = React.useCallback(
    (stagger: string[]) => {
      const b = before.current;
      const el = list.current;
      before.current = null;
      if (!b || !el || reduced) return;
      const o = el.getBoundingClientRect();
      const seen = new Set<string>();
      el.querySelectorAll<HTMLElement>("[data-chip]").forEach((c) => {
        const id = c.dataset.chip!;
        seen.add(id);
        const was = b.get(id);
        if (!was) {
          c.animate(
            [
              { opacity: 0, transform: "translateY(6px)", filter: "blur(3px)" },
              { opacity: 1, transform: "none", filter: "blur(0px)" },
            ],
            { duration: 320, delay: Math.max(0, stagger.indexOf(id)) * 70, easing: EASE, fill: "backwards" },
          );
          return;
        }
        // A glide still running is cancelled first: the position taken at the click already includes it.
        c.getAnimations().forEach((a) => a.id === "chip-glide" && a.cancel());
        const r = c.getBoundingClientRect();
        const dx = was.x - (r.left - o.left + el.scrollLeft);
        const dy = was.y - (r.top - o.top);
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 340, easing: EASE }).id = "chip-glide";
      });
      // A chip that went is its own element, detached by React: back where it stood, fading.
      b.forEach((was, id) => {
        const layer = ghosts.current;
        if (seen.has(id) || was.el.isConnected || !layer) return;
        const g = was.el;
        g.inert = true;
        g.setAttribute("aria-hidden", "true");
        g.removeAttribute("data-chip");
        Object.assign(g.style, { position: "absolute", left: `${was.x}px`, top: `${was.y}px`, width: `${was.w}px`, height: `${was.h}px`, margin: "0" });
        layer.appendChild(g);
        const a = g.animate(
          [
            { opacity: 1, transform: "none", filter: "blur(0px)" },
            { opacity: 0, transform: "scale(0.92)", filter: "blur(3px)" },
          ],
          { duration: 200, easing: EASE, fill: "forwards" },
        );
        a.onfinish = a.oncancel = () => g.remove();
      });
    },
    [list, ghosts, reduced],
  );
  return React.useMemo(() => ({ capture, play }), [capture, play]);
}

function CheckBox({ on, reduced }: { on: boolean; reduced: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-3.5 shrink-0 items-center justify-center rounded-[4px] transition-[background-color,box-shadow] duration-200"
      style={{ background: on ? "var(--primary)" : "transparent", boxShadow: on ? "inset 0 0 0 1px var(--primary)" : "inset 0 0 0 1px color-mix(in oklab, var(--foreground) 28%, transparent)" }}
    >
      <svg viewBox="0 0 16 16" className="size-3 text-primary-foreground" fill="none">
        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} style={{ strokeDashoffset: on ? 0 : 1, transition: reduced ? "none" : `stroke-dashoffset 260ms ${EASE}` }} />
      </svg>
    </span>
  );
}

export function FilterBar({
  fields,
  value: controlled,
  defaultValue = NO_FILTERS,
  onValueChange,
  count,
  total,
  noun = NOUN,
  parse,
  hotkey = "f",
  locales,
  label = "Filters",
  className = "",
  ...props
}: FilterBarProps) {
  const reduced = useReducedMotion();
  const uid = React.useId();
  const [own, setOwn] = React.useState<Filter[]>(defaultValue);
  const filters = controlled ?? own;
  const filtersRef = React.useRef(filters);
  filtersRef.current = filters;

  const [menu, setMenu] = React.useState<Menu | null>(null);
  const [phase, setPhase] = React.useState<Phase>("closed");
  const [step, setStep] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [parsing, setParsing] = React.useState<{ status: "idle" | "pending" | "error"; text?: string }>({ status: "idle" });
  const [box, setBox] = React.useState<Box>({ left: 0, top: 0, width: 0, height: 28 });
  const [wrapW, setWrapW] = React.useState(PANEL_W);
  const [panelH, setPanelH] = React.useState(0);
  const [leaving, setLeaving] = React.useState<{ rows: Row[]; dir: number; key: number } | null>(null);
  const [slide, setSlide] = React.useState({ dir: 0, key: 0 });
  const [announce, setAnnounce] = React.useState("");

  const wrapRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const ghostRef = React.useRef<HTMLDivElement>(null);
  const addRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const parseRowRef = React.useRef<HTMLDivElement>(null);
  const anchorRef = React.useRef<HTMLElement | null>(null);
  const timer = React.useRef(0);
  const stagger = React.useRef<string[]>([]);
  const motion = useChipMotion(listRef, ghostRef, reduced);

  const num = React.useMemo(() => new Intl.NumberFormat(locales), [locales]);
  const fieldOf = React.useCallback((id: string) => fields.find((f) => f.id === id), [fields]);
  const say = (text: string) => setAnnounce((a) => (a === text ? `${text} ` : text));
  const sentence = (f: Filter | NewFilter) => {
    const field = fieldOf(f.field);
    const w = words(f, field, num);
    return `${field?.label ?? f.field} ${w.op} ${w.value}`;
  };

  /** Commits filters; `move` takes the chips' positions first so they glide into the new layout. */
  const commit = (next: Filter[], move = true, enter: string[] = []) => {
    if (move) motion.capture();
    stagger.current = enter;
    filtersRef.current = next;
    if (controlled === undefined) setOwn(next);
    onValueChange?.(next);
  };

  React.useLayoutEffect(() => {
    motion.play(stagger.current);
    stagger.current = [];
  }, [filters, motion]);

  // ── The panel ──────────────────────────────────────────
  const open = (m: Menu, anchor: HTMLElement) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    window.clearTimeout(timer.current);
    const a = anchor.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    setBox({ left: a.left - w.left, top: a.top - w.top, width: a.width, height: a.height });
    setWrapW(w.width);
    anchorRef.current = anchor;
    const editing = m.mode === "edit" ? filtersRef.current.find((f) => f.id === m.filter) : undefined;
    setMenu(m);
    setStep(editing ? editing.field : null);
    setQuery(editing && "text" in editing ? editing.text : editing && "number" in editing ? String(editing.number) : "");
    setActive(0);
    setLeaving(null);
    setSlide((s) => ({ dir: 0, key: s.key + 1 }));
    setParsing({ status: "idle" });
    setPhase(reduced ? "open" : "opening");
  };

  const close = React.useCallback(
    (refocus = true) => {
      window.clearTimeout(timer.current);
      // A chip whose values were all ticked off goes when the panel closes.
      const empty = filtersRef.current.filter((f) => "values" in f && !f.values.length);
      if (empty.length) {
        motion.capture();
        const next = filtersRef.current.filter((f) => !empty.includes(f));
        filtersRef.current = next;
        if (controlled === undefined) setOwn(next);
        onValueChange?.(next);
      }
      if (refocus) {
        const back = anchorRef.current;
        (back?.isConnected ? back : addRef.current)?.focus({ preventScroll: true });
      }
      if (reduced) {
        setPhase("closed");
        setMenu(null);
        return;
      }
      setPhase("closing");
      timer.current = window.setTimeout(() => {
        setPhase("closed");
        setMenu(null);
      }, CLOSE);
    },
    [controlled, onValueChange, reduced, motion],
  );

  React.useEffect(() => {
    if (phase !== "opening") return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setPhase("open"));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [phase]);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  React.useEffect(() => {
    if (menu && phase !== "closing") inputRef.current?.focus({ preventScroll: true });
  }, [menu, phase]);

  React.useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const measure = () => setPanelH(panel.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [menu]);

  // A press outside closes it.
  React.useEffect(() => {
    if (!menu || phase === "closing") return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menu, phase, close]);

  // F (or your key) opens it from anywhere, unless something is being typed.
  React.useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== hotkey.toLowerCase() || e.metaKey || e.ctrlKey || e.altKey || e.isComposing || menu) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight || !addRef.current) return;
      e.preventDefault();
      open({ mode: "new" }, addRef.current);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const editing = menu?.mode === "edit" ? filters.find((f) => f.id === menu.filter) : undefined;
  const stepField = step ? fieldOf(step) : undefined;

  // ── What the panel lists ───────────────────────────────
  const rows: Row[] = (() => {
    const q = query.trim().toLowerCase();
    if (!menu) return [];
    if (!stepField) {
      const out: Row[] = fields.filter((f) => !q || f.label.toLowerCase().includes(q)).map((field) => ({ kind: "field", field }));
      if (q)
        for (const field of fields)
          for (const option of field.type === "option" ? (field.options ?? []) : [])
            if (option.label.toLowerCase().includes(q) && out.length < 8) out.push({ kind: "jump", field, option });
      if (parse && q.length > 2) out.push({ kind: "parse", text: query.trim() });
      if (!out.length) out.push({ kind: "hint", text: "No properties match" });
      return out;
    }
    const field = stepField;
    if (field.type === "option") {
      const ticked = editing && "values" in editing ? editing.values : [];
      const out: Row[] = (field.options ?? []).filter((o) => !q || o.label.toLowerCase().includes(q)).map((option) => ({ kind: "option", field, option, checked: ticked.includes(option.value) }));
      return out.length ? out : [{ kind: "hint", text: `No ${field.label.toLowerCase()} matches` }];
    }
    if (field.type === "text") {
      const t = query.trim();
      if (!t) return [{ kind: "hint", text: `Type to filter by ${field.label.toLowerCase()}` }];
      return [
        { kind: "set", field, filter: { field: field.id, op: "contains", text: t }, label: `Contains “${t}”` },
        { kind: "set", field, filter: { field: field.id, op: "does not contain", text: t }, label: `Doesn't contain “${t}”` },
      ];
    }
    if (field.type === "number") {
      const n = Number(query.replace(/[^\d.-]/g, ""));
      if (!query.trim() || Number.isNaN(n)) return [{ kind: "hint", text: "Type a number" }];
      const unit = field.unit ? ` ${n === 1 ? field.unit[0] : field.unit[1]}` : "";
      return (["at least", "at most", "is exactly"] as const).map((op) => ({
        kind: "set" as const,
        field,
        filter: { field: field.id, op, number: n },
        label: `${op[0].toUpperCase()}${op.slice(1)} ${num.format(n)}${unit}`,
      }));
    }
    const n = parseInt(query, 10);
    const typed: Row[] =
      n > 0
        ? [
            { kind: "set", field, filter: { field: field.id, op: "within", days: n }, label: `Last ${dayLabel(n)}` },
            { kind: "set", field, filter: { field: field.id, op: "older than", days: n }, label: `More than ${dayLabel(n)} ago` },
          ]
        : [];
    return [...typed, ...DATE_PRESETS.filter((p) => !q || p.label.toLowerCase().includes(q)).map((p) => ({ kind: "set" as const, field, filter: { field: field.id, op: p.op, days: p.days }, label: p.label }))];
  })();
  const choosable = rows.filter((r) => r.kind !== "hint");
  const activeIndex = Math.min(active, Math.max(0, choosable.length - 1));

  /** To a property's values (dir 1) or back to the properties (dir -1); the old list slides out the other way. */
  const goStep = (next: string | null, dir: number) => {
    if (!reduced) setLeaving({ rows, dir, key: Date.now() });
    setSlide((s) => ({ dir, key: s.key + 1 }));
    setStep(next);
    setQuery("");
    setActive(0);
    setParsing({ status: "idle" });
  };

  const addFilter = (draft: NewFilter) => {
    const added: string[] = [];
    const next = merge(filtersRef.current, draft, added);
    commit(next, true, added);
    say(`Filter added: ${sentence(draft)}.`);
  };

  const toggleValue = (field: FilterField, option: FilterOption) => {
    if (editing && "values" in editing) {
      const on = editing.values.includes(option.value);
      const values = on ? editing.values.filter((v) => v !== option.value) : [...editing.values, option.value];
      commit(filtersRef.current.map((f) => (f.id === editing.id ? { ...editing, values } : f)), false);
      say(`${option.label} ${on ? "removed from" : "added to"} ${field.label}.`);
      return;
    }
    // From "Filter": the first tick makes the chip and the panel goes on editing it.
    const added: string[] = [];
    const next = merge(filtersRef.current, { field: field.id, op: "is", values: [option.value] }, added);
    commit(next, true, added);
    const made = next.find((f) => f.field === field.id && f.op === "is");
    if (made) setMenu({ mode: "edit", filter: made.id });
    say(`Filter added: ${field.label} is ${option.label}.`);
  };

  const runParse = async (text: string) => {
    if (!parse || parsing.status === "pending") return;
    setParsing({ status: "pending", text });
    try {
      const made = await parse(text);
      if (!made?.length) throw new Error("Nothing found");
      let next = filtersRef.current;
      const added: string[] = [];
      for (const d of made) next = merge(next, d, added);
      setParsing({ status: "idle" });
      commit(next, true, added);
      say(`Added ${made.map(sentence).join(", ")}.`);
      close();
    } catch {
      setParsing({ status: "error", text });
      say(`Couldn't turn “${text}” into filters.`);
      if (!reduced)
        parseRowRef.current?.animate([{ transform: "none" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "none" }], { duration: 380, easing: "ease-out" });
    }
  };

  const choose = (row: Row, viaBox = false) => {
    switch (row.kind) {
      case "field":
        goStep(row.field.id, 1);
        return;
      case "jump":
        addFilter({ field: row.field.id, op: "is", values: [row.option.value] });
        close();
        return;
      case "option":
        if (editing || viaBox) toggleValue(row.field, row.option);
        else {
          addFilter({ field: row.field.id, op: "is", values: [row.option.value] });
          close();
        }
        return;
      case "set":
        if (editing) {
          const next = { ...row.filter, id: editing.id } as Filter;
          commit(filtersRef.current.map((f) => (f.id === editing.id ? next : f)), false);
          say(`Filter changed: ${sentence(next)}.`);
        } else addFilter(row.filter);
        close();
        return;
      case "parse":
        runParse(row.text);
        return;
    }
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const last = choosable.length - 1;
    const canBack = menu?.mode === "new" && !!step;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (last < 0) return;
      setActive(e.key === "ArrowDown" ? (activeIndex >= last ? 0 : activeIndex + 1) : activeIndex <= 0 ? last : activeIndex - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = choosable[activeIndex];
      if (row) choose(row);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (canBack) goStep(null, -1);
      else close();
    } else if ((e.key === "Backspace" || e.key === "ArrowLeft") && !query && canBack) {
      e.preventDefault();
      goStep(null, -1);
    } else if (e.key === "ArrowRight" && !query && choosable[activeIndex]?.kind === "field") {
      e.preventDefault();
      choose(choosable[activeIndex]);
    }
  };

  // ── Chips ──────────────────────────────────────────────
  const flipOp = (f: Filter) => {
    const field = fieldOf(f.field);
    const ops = OPS[field?.type ?? "option"];
    const op = ops[(ops.indexOf(f.op) + 1) % ops.length];
    const next = { ...f, op } as Filter;
    commit(filtersRef.current.map((x) => (x.id === f.id ? next : x)), false);
    say(`${sentence(next)}.`);
  };

  const remove = (f: Filter) => {
    commit(filtersRef.current.filter((x) => x.id !== f.id));
    say(`Removed ${fieldOf(f.field)?.label ?? f.field} filter.`);
    requestAnimationFrame(() => addRef.current?.focus({ preventScroll: true }));
  };

  const clearAll = () => {
    commit([]);
    say("Filters cleared.");
    requestAnimationFrame(() => addRef.current?.focus({ preventScroll: true }));
  };

  // ── Render ─────────────────────────────────────────────
  const mounted = menu !== null;
  const expanded = phase === "open";
  const width = Math.min(PANEL_W, wrapW);
  const left = Math.max(0, Math.min(box.left, wrapW - width));
  const top = box.top + box.height + 6;
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-o${i}`;
  const filtered = filters.length > 0;
  const placeholder = editing ? (stepField?.type === "option" ? `Find ${stepField.label.toLowerCase()}…` : `${stepField?.label}…`) : stepField ? `${stepField.label}…` : parse ? "Filter by property, or describe it…" : "Filter by…";

  const renderRows = (list: Row[], live: boolean) => {
    let n = -1;
    return list.map((row, i) => {
      if (row.kind === "hint")
        return (
          <p key={`hint-${i}`} className="flex h-8 items-center px-2 text-[12.5px] text-muted-foreground">
            {row.text}
          </p>
        );
      n++;
      const index = n;
      const on = live && index === activeIndex;
      const key = row.kind === "field" ? `f-${row.field.id}` : row.kind === "jump" ? `j-${row.field.id}-${row.option.value}` : row.kind === "option" ? `o-${row.option.value}` : row.kind === "set" ? `s-${row.label}` : "parse";
      const pending = row.kind === "parse" && parsing.status === "pending";
      const failed = row.kind === "parse" && parsing.status === "error" && parsing.text === row.text;
      return (
        <div
          key={key}
          ref={row.kind === "parse" && live ? parseRowRef : undefined}
          id={live ? optionId(index) : undefined}
          role={live ? "option" : undefined}
          aria-selected={live ? on : undefined}
          aria-checked={live && row.kind === "option" ? row.checked : undefined}
          onPointerMove={live ? () => index !== activeIndex && setActive(index) : undefined}
          onPointerDown={(e) => e.preventDefault()}
          onClick={live ? () => choose(row) : undefined}
          className={`relative flex h-8 cursor-pointer items-center gap-2 rounded-[8px] px-2 text-[13px] ${on ? "text-foreground" : "text-foreground/90"}`}
        >
          {row.kind === "option" && (
            <span
              className="-m-1.5 flex size-7 items-center justify-center"
              onClick={(e) => {
                if (!live) return;
                e.stopPropagation();
                choose(row, true);
              }}
            >
              <CheckBox on={row.checked} reduced={reduced} />
            </span>
          )}
          {row.kind === "parse" ? (
            <span className={`flex size-4 shrink-0 items-center justify-center ${failed ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} aria-hidden="true">
              {pending ? <span className="size-3.5 animate-spin rounded-full border-[1.5px] border-current border-e-transparent" /> : <Sparkles className="size-3.5" strokeWidth={1.75} />}
            </span>
          ) : row.kind === "field" ? (
            <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3.5" aria-hidden="true">
              {row.field.icon ?? <ListFilter strokeWidth={1.75} />}
            </span>
          ) : row.kind === "jump" || row.kind === "option" ? (
            row.option.icon ? (
              <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3.5" aria-hidden="true">
                {row.option.icon}
              </span>
            ) : null
          ) : null}
          {row.kind === "jump" && (
            <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
              {row.field.label}
              <ChevronRight className="size-3" strokeWidth={2} aria-hidden="true" />
            </span>
          )}
          <span className={`min-w-0 flex-1 truncate ${failed ? "text-red-600 dark:text-red-400" : ""}`}>
            {row.kind === "field" ? row.field.label : row.kind === "jump" || row.kind === "option" ? row.option.label : row.kind === "set" ? row.label : (
              <TextMorph animateWidth={false}>{pending ? "Working out the filters" : failed ? "Couldn't make filters from that" : `Filter by “${row.text}”`}</TextMorph>
            )}
          </span>
          {row.kind === "field" && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />}
        </div>
      );
    });
  };

  return (
    <div
      ref={wrapRef}
      className={`@container relative w-full text-foreground ${className}`}
      onBlur={(e) => {
        // Focus leaving for another window (a screenshot, a switch of app) keeps it open; leaving the bar closes it.
        if (!menu || phase === "closing" || !document.hasFocus() || wrapRef.current?.contains(e.relatedTarget as Node)) return;
        close(false);
      }}
      {...props}
    >
      <div className="flex items-start gap-2">
        <div
          ref={listRef}
          role="group"
          aria-label={label}
          className="relative -m-1 flex min-w-0 flex-1 flex-wrap items-center gap-1.5 p-1 @max-[30rem]:flex-nowrap @max-[30rem]:overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {filters.map((f) => {
            const field = fieldOf(f.field);
            const w = words(f, field, num);
            const isOpen = mounted && editing?.id === f.id && phase !== "closing";
            return (
              <div key={f.id} data-chip={f.id} role="group" aria-label={sentence(f)} className="inline-flex h-7 shrink-0 items-center rounded-full bg-background ps-2.5 pe-0.5 text-[12.5px] shadow-[inset_0_0_0_1px_var(--border)]">
                <span className="flex items-center gap-1.5 whitespace-nowrap pe-1.5 text-muted-foreground [&_svg]:size-3.5">
                  {field?.icon && <span aria-hidden="true">{field.icon}</span>}
                  {field?.label ?? f.field}
                </span>
                <span aria-hidden="true" className="h-3.5 w-(--hairline) bg-border" />
                <button
                  type="button"
                  onClick={() => flipOp(f)}
                  aria-label={`${field?.label}: “${w.op}”. Change it`}
                  title="Change"
                  className={`mx-0.5 inline-flex h-6 cursor-pointer items-center whitespace-nowrap rounded-full px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${FOCUS}`}
                >
                  <TextMorph>{w.op}</TextMorph>
                </button>
                <span aria-hidden="true" className="h-3.5 w-(--hairline) bg-border" />
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={isOpen}
                  aria-label={`${field?.label} ${w.op} ${w.value}. Change the value`}
                  onClick={(e) => (isOpen ? close() : open({ mode: "edit", filter: f.id }, e.currentTarget))}
                  className={`mx-0.5 inline-flex h-6 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-1.5 font-medium transition-colors hover:bg-accent ${isOpen ? "bg-accent" : ""} ${FOCUS}`}
                >
                  {w.icon && (
                    <span aria-hidden="true" className="flex text-muted-foreground [&_svg]:size-3.5">
                      {w.icon}
                    </span>
                  )}
                  <TextMorph>{w.value}</TextMorph>
                </button>
                <button
                  type="button"
                  onClick={() => remove(f)}
                  aria-label={`Remove ${field?.label ?? f.field} filter`}
                  className={`flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${FOCUS}`}
                >
                  <X className="size-3.5" strokeWidth={1.75} />
                </button>
              </div>
            );
          })}

          {/* "Filter" says its name until there are filters; then it's the + at the end of them. */}
          <button
            ref={addRef}
            data-chip="__add"
            type="button"
            aria-haspopup="listbox"
            aria-expanded={mounted && menu?.mode === "new" && phase !== "closing"}
            aria-keyshortcuts={hotkey ?? undefined}
            aria-label={filtered ? "Add filter" : undefined}
            onClick={(e) => (mounted && menu?.mode === "new" ? close() : open({ mode: "new" }, e.currentTarget))}
            className={`inline-flex h-7 shrink-0 cursor-pointer items-center rounded-full px-2 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground @max-[30rem]:order-first ${mounted && menu?.mode === "new" ? "bg-accent text-foreground" : ""} ${filtered ? "@max-[30rem]:shadow-[inset_0_0_0_1px_var(--border)]" : "shadow-[inset_0_0_0_1px_var(--border)]"} ${FOCUS}`}
          >
            <span className="relative flex size-3.5 items-center justify-center" aria-hidden="true">
              <ListFilter className="absolute size-3.5" strokeWidth={1.75} style={swap(!filtered, reduced)} />
              <Plus className="absolute size-3.5" strokeWidth={1.75} style={swap(filtered, reduced)} />
            </span>
            <span className="grid" style={{ gridTemplateColumns: filtered ? "0fr" : "1fr", opacity: filtered ? 0 : 1, transition: reduced ? "none" : `grid-template-columns 320ms ${EASE}, opacity 200ms ${EASE}` }}>
              <span className="min-w-0 overflow-hidden whitespace-nowrap ps-1.5">Filter</span>
            </span>
          </button>

          {filtered && (
            <button
              data-chip="__clear"
              type="button"
              onClick={clearAll}
              className={`inline-flex h-7 shrink-0 cursor-pointer items-center rounded-full px-2 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${FOCUS}`}
            >
              Clear
            </button>
          )}

          {/* Chips that went: their own elements, fading where they stood. */}
          <div ref={ghostRef} aria-hidden="true" className="pointer-events-none absolute inset-0" />
        </div>

        {count !== undefined && (
          <span className="flex h-7 shrink-0 items-center whitespace-nowrap text-[12px] tabular-nums text-muted-foreground">
            <NumberRoll value={count} locales={locales} />
            <span className="grid" style={{ gridTemplateColumns: filtered && total !== undefined ? "1fr" : "0fr", opacity: filtered && total !== undefined ? 1 : 0, transition: reduced ? "none" : `grid-template-columns 320ms ${EASE}, opacity 200ms ${EASE}` }}>
              <span className="min-w-0 overflow-hidden whitespace-nowrap">&nbsp;of {total !== undefined ? num.format(total) : ""}</span>
            </span>
            &nbsp;{count === 1 ? noun[0] : noun[1]}
          </span>
        )}
      </div>

      {/* The panel grows out from under whatever opened it, and folds back there. */}
      {mounted && (
        <div
          className="absolute z-50 overflow-hidden bg-popover text-popover-foreground"
          style={{
            top,
            left: expanded ? left : box.left,
            width: expanded ? width : box.width,
            height: expanded ? panelH : box.height,
            borderRadius: expanded ? 14 : box.height / 2,
            opacity: expanded ? 1 : 0,
            boxShadow: "0 0 0 1px var(--border)",
            transition: reduced
              ? "none"
              : phase === "closing"
                ? `width ${CLOSE}ms ${UI}, height ${CLOSE}ms ${UI}, left ${CLOSE}ms ${UI}, border-radius ${CLOSE}ms ${UI}, opacity ${CLOSE}ms ${UI}`
                : `width ${OPEN}ms ${UI}, height ${OPEN}ms ${UI}, left ${OPEN}ms ${UI}, border-radius ${OPEN}ms ${UI}, opacity 160ms ${UI}`,
          }}
        >
          <div ref={panelRef} inert={!expanded} className="absolute start-0 top-0" style={{ width, opacity: expanded ? 1 : 0, transition: reduced ? "none" : expanded ? `opacity 180ms ${EASE} 60ms` : "opacity 90ms ease-out" }}>
            <div className="flex h-10 items-center gap-1 border-b border-border ps-1.5 pe-2">
              {menu?.mode === "new" && step ? (
                <button
                  type="button"
                  aria-label="Back to properties"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => goStep(null, -1)}
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ChevronLeft className="size-4" strokeWidth={1.75} />
                </button>
              ) : (
                <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3.5" aria-hidden="true">
                  {stepField?.icon ?? <ListFilter strokeWidth={1.75} />}
                </span>
              )}
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded={expanded}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={choosable.length ? optionId(activeIndex) : undefined}
                aria-label={placeholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                  if (parsing.status === "error") setParsing({ status: "idle" });
                }}
                onKeyDown={onInputKey}
                placeholder={placeholder}
                inputMode={stepField?.type === "number" || stepField?.type === "date" ? "decimal" : undefined}
                className="h-9 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground [@media(pointer:coarse)]:text-[16px]"
              />
            </div>
            <div className="relative max-h-[296px] overflow-y-auto overflow-x-clip p-1">
              <div
                key={slide.key}
                id={listId}
                role="listbox"
                aria-label={stepField ? stepField.label : "Properties"}
                aria-multiselectable={stepField?.type === "option" ? true : undefined}
                className="relative"
                ref={(el) => {
                  if (!el || !slide.dir || el.dataset.in || reduced) return;
                  el.dataset.in = "1";
                  el.animate(
                    [
                      { transform: `translateX(${slide.dir * 16}px)`, opacity: 0 },
                      { transform: "none", opacity: 1 },
                    ],
                    { duration: 240, easing: EASE, fill: "backwards" },
                  );
                }}
              >
                {/* The highlight glides between rows; rows are a fixed height, so its place needs no measuring. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-8 rounded-[8px] bg-accent"
                  style={{ transform: `translateY(${activeIndex * ROW}px)`, opacity: choosable.length ? 1 : 0, transition: reduced ? "none" : `transform 160ms ${UI}` }}
                />
                {renderRows(rows, true)}
              </div>
              {leaving && (
                <div
                  key={leaving.key}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-1 top-1"
                  ref={(el) => {
                    if (!el || el.dataset.out) return;
                    el.dataset.out = "1";
                    el.animate(
                      [
                        { transform: "none", opacity: 1 },
                        { transform: `translateX(${-leaving.dir * 16}px)`, opacity: 0 },
                      ],
                      { duration: 160, easing: EASE, fill: "forwards" },
                    ).onfinish = () => setLeaving((l) => (l?.key === leaving.key ? null : l));
                  }}
                >
                  {renderRows(leaving.rows, false)}
                </div>
              )}
            </div>
            {editing && stepField?.type === "option" && (
              <div className="flex h-9 items-center justify-between border-t border-border ps-3 pe-1.5 text-[12px] text-muted-foreground">
                <span className="tabular-nums">
                  <NumberRoll value={"values" in editing ? editing.values.length : 0} /> selected
                </span>
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => close()}
                  className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 font-medium text-foreground hover:bg-accent"
                >
                  <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
