// Hairline UI · tag-input · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

// Mo'een adaptation: physical spacing/position utilities switched to logical (RTL-safe) ones.
"use client";

import * as React from "react";
import { NumberRoll } from "./number-roll";
import { TextMorph } from "./text-morph";
import {
  carryFrames,
  flyFrames,
  LEAVE_FRAMES,
  playTokens,
  pulseToken,
  shakeToken,
  snapshotTokens,
  TOKEN_EASE,
  type TokenBox,
  type TokenEnter,
  type TokenSnapshot,
} from "./use-token-flip";

/* ─────────────────────────────────────────────────────────
 * TAG INPUT: the To field, the invite field, the labels field
 *
 *   type      Enter or a comma, and the letters you typed stay
 *             where they are while a hairline shell grows round
 *             them; the caret is already past it
 *   paste     a pasted list spills out of the caret chip by
 *             chip; a duplicate flies into its twin, which
 *             bumps; an invalid one lands red and shakes
 *   resolve   "maya@fernhill.co" morphs into "Maya Chen" while
 *             her initials open in, once resolve() knows her
 *   pick      a suggestion's name is carried from the list
 *             into its chip
 *   back      Backspace in an empty field selects the last
 *             chip; again, and its shell drops away and the
 *             letters are text you can edit
 *   reflow    every chip glides when one leaves or a line
 *             wraps; the field's height eases to fit
 *   collapse  out of focus, lines past `collapse` fold away and
 *             a "+4" counts them
 * ───────────────────────────────────────────────────────── */

export interface TagInputTag {
  id: string;
  /** What was typed or picked, normalised: the address, the label. */
  value: string;
  /** What the chip shows instead, once known: a name for an address. */
  label?: string;
  /** A picture for the chip. Without one, a known label gets its initials. */
  image?: string;
  /** Why the value isn't valid. The chip turns red and stays until it's fixed or removed. */
  error?: string;
}

export interface TagInputSuggestion {
  value: string;
  label?: string;
  image?: string;
  /** A second line in the list; defaults to the value when a label is shown. */
  description?: string;
}

export interface TagInputHandle {
  /** Runs text through the paste path: split, checked and cascaded in. */
  paste: (text: string) => void;
  focus: () => void;
  /** Removes every tag. */
  clear: () => void;
}

export interface TagInputProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "defaultValue" | "onChange"> {
  value?: TagInputTag[];
  defaultValue?: TagInputTag[];
  onValueChange?: (tags: TagInputTag[]) => void;
  /** Return a message to mark a value invalid. */
  validate?: (value: string) => string | null | undefined | void;
  /** Look a value up once it's added: resolve to a label (and image) for the chip to morph into, or null to leave it. */
  resolve?: (value: string) => Promise<{ label?: string; image?: string } | null | undefined | void>;
  /** A list to filter, or a function that finds matches for what's typed (may be async). */
  suggestions?: TagInputSuggestion[] | ((query: string) => TagInputSuggestion[] | Promise<TagInputSuggestion[]>);
  /** Applied to every value before it's checked and compared, e.g. lower-casing addresses. */
  normalize?: (value: string) => string;
  /** What splits typed and pasted text into values. */
  separators?: RegExp;
  /** How many tags the field takes. */
  max?: number;
  /** Shown when a value doesn't fit under `max`. */
  limitMessage?: string;
  /** The suggestion row that adds what's typed as it is; null hides it. */
  createLabel?: ((text: string) => string) | null;
  /** Lines to show while the field is out of focus; the rest fold into a count. */
  collapse?: number;
  /** Accessible name of the field. */
  label?: string;
  placeholder?: string;
  /** A line under the field, replaced by errors and notices while they last. */
  hint?: string;
  /** Submits the valid values, comma-separated, with a form. */
  name?: string;
  disabled?: boolean;
  ref?: React.Ref<TagInputHandle>;
}

type Draft = { value: string; label?: string; image?: string };
type Ghost = {
  key: number;
  kind: "leave" | "fly" | "unspool" | "carry";
  text: string;
  /** Root coordinates. */
  box: TokenBox;
  to?: TokenBox;
  /** Where the letters sit inside the box. */
  inner?: TokenBox;
  twin?: string;
  delay?: number;
  /** Fades in where it starts (a pasted duplicate) instead of already being there. */
  appear?: boolean;
  error?: boolean;
  avatar?: { image?: string; name: string };
};
/** A copy flying to a chip whose place is only known after layout; `after` starts it where it would have landed, after that chip. */
type Flight = { kind: "fly" | "carry"; text: string; from: TokenBox | { after: string | null; w: number }; twin: string; delay: number };
type Pending = {
  before: TokenSnapshot | null;
  enter: Map<string, TokenEnter>;
  skipInput?: boolean;
  ghosts: Ghost[];
  /** Ghosts flying to a chip whose place is only known after layout. */
  flights: Flight[];
  shake: { id: string; delay: number }[];
  shakeField?: boolean;
  /** Edited text glides out of this box (root coordinates) into the input. */
  inputFrom?: { box: TokenBox; fade: boolean };
  focus?: "input" | string;
};
type Notice = { text: string; tone: "muted" | "warn"; key: number };
type Row = TagInputSuggestion & { create?: boolean };
type How = { type: TokenBox | null } | { paste: { x: number; y: number } } | { pick: TokenBox };

const EASE = TOKEN_EASE;
const EMPTY: TagInputTag[] = [];
const SEPARATORS = /[,;\n]+/;
const CHIP_H = 28;
/** Labels longer than this many characters are cut to fit a phone-width field; the chip's title has the whole. */
const LONG = 28;
const PAD = 5;
const GAP = 6;
const CREATE = (text: string) => `Add “${text}”`;
const SAME = (v: string) => v;

let seq = 0;
const newId = () => `tag-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const display = (t: { value: string; label?: string }) => t.label || t.value;
const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
const shift = (b: TokenBox, dx: number, dy: number): TokenBox => ({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h });

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  React.useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);

const swap = (on: boolean, reduced: boolean): React.CSSProperties => ({
  opacity: on ? 1 : 0,
  transform: on ? "none" : "scale(0.6)",
  filter: on ? "none" : "blur(3px)",
  transition: reduced ? "none" : `opacity 240ms ${EASE}, transform 380ms ${EASE}, filter 240ms ${EASE}`,
});

const shellStyle = (error: boolean, selected: boolean): React.CSSProperties => ({
  background: error ? "color-mix(in oklab, #ef4444 7%, var(--background))" : selected ? "var(--accent)" : "var(--background)",
  boxShadow: error
    ? `inset 0 0 0 1px color-mix(in oklab, #ef4444 ${selected ? 75 : 45}%, transparent)`
    : selected
      ? "inset 0 0 0 1px color-mix(in oklab, var(--ring) 70%, transparent)"
      : "inset 0 0 0 1px var(--border)",
});

function Avatar({ image, name, size }: { image?: string; name: string; size: number }) {
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt="" draggable={false} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initials(name)}
    </span>
  );
}

function Cross() {
  return (
    <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden="true">
      <path d="M3.5 3.5 8.5 8.5M8.5 3.5 3.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** A sentence that changes crossfades whole: the old one lifts away through a blur while the new one rises in. */
function Line({ text, reduced }: { text: string; reduced: boolean }) {
  const [shown, setShown] = React.useState({ text, key: 0 });
  const [leaving, setLeaving] = React.useState<{ text: string; key: number }[]>([]);
  if (text !== shown.text) {
    if (shown.text && !reduced) setLeaving((l) => [...l, shown]);
    setShown({ text, key: shown.key + 1 });
  }
  return (
    <span className="relative block">
      <span
        key={shown.key}
        className="block"
        ref={(el) => {
          if (!el || reduced || shown.key === 0 || el.dataset.in) return;
          el.dataset.in = "1";
          el.animate(
            [
              { opacity: 0, transform: "translateY(0.35em)", filter: "blur(4px)" },
              { opacity: 1, transform: "none", filter: "blur(0px)" },
            ],
            { duration: 420, delay: 60, easing: EASE, fill: "backwards" },
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
                { opacity: 1, transform: "none", filter: "blur(0px)" },
                { opacity: 0, transform: "translateY(-0.35em)", filter: "blur(4px)" },
              ],
              { duration: 200, easing: EASE, fill: "forwards" },
            ).onfinish = () => setLeaving((all) => all.filter((x) => x.key !== l.key));
          }}
        >
          {l.text}
        </span>
      ))}
    </span>
  );
}

/** A copy of a chip (or of its letters) that leaves, flies into a twin, drops its shell or carries a name in. */
function GhostChip({ ghost, onDone }: { ghost: Ghost; onDone: (ghost: Ghost) => void }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const shell = React.useRef<HTMLSpanElement>(null);
  const letters = React.useRef<HTMLSpanElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let a: Animation;
    if (ghost.kind === "leave") a = el.animate(LEAVE_FRAMES, { duration: 280, easing: EASE, fill: "forwards" });
    else if (ghost.kind === "fly" && ghost.to)
      a = el.animate(flyFrames(ghost.box, ghost.to, ghost.appear), { duration: ghost.appear ? 820 : 620, delay: ghost.delay ?? 0, easing: EASE, fill: "both" });
    else if (ghost.kind === "carry" && ghost.to) a = el.animate(carryFrames(ghost.box, ghost.to), { duration: 480, easing: EASE, fill: "both" });
    else {
      // The shell shrinks round the letters and fades; the letters fade into the input's own.
      const b = ghost.box;
      const i = ghost.inner ?? b;
      const left = Math.max(0, i.x - b.x - 3);
      const right = Math.max(0, b.x + b.w - (i.x + i.w) - 3);
      shell.current?.animate(
        [
          { clipPath: "inset(0px 0px 0px 0px round 999px)", opacity: 1 },
          { clipPath: `inset(4px ${right}px 4px ${left}px round 999px)`, opacity: 0 },
        ],
        { duration: 360, easing: EASE, fill: "forwards" },
      );
      el.querySelector<HTMLElement>("[data-ghost-avatar]")?.animate(LEAVE_FRAMES, { duration: 240, easing: EASE, fill: "forwards" });
      a = (letters.current ?? el).animate([{ opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(4px)" }], { duration: 320, easing: EASE, fill: "forwards" });
    }
    a.onfinish = () => onDone(ghost);
    return () => a.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carry = ghost.kind === "carry";
  const inner = ghost.inner;
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute flex items-center whitespace-nowrap will-change-transform ${carry ? "text-[13.5px]" : "rounded-full px-2.5 text-[13px]"} ${
        ghost.error ? "text-red-600 dark:text-red-400" : "text-foreground"
      }`}
      style={{ left: ghost.box.x, top: ghost.box.y, width: ghost.box.w, height: ghost.box.h, transformOrigin: carry ? "left center" : "center" }}
    >
      {!carry && <span ref={shell} className="absolute inset-0 rounded-full" style={shellStyle(!!ghost.error, false)} />}
      {ghost.avatar && (
        <span data-ghost-avatar="" className="absolute start-1 top-1">
          <Avatar image={ghost.avatar.image} name={ghost.avatar.name} size={20} />
        </span>
      )}
      <span ref={letters} className={inner ? "absolute block py-1" : "relative"} style={inner ? { left: inner.x - ghost.box.x, top: inner.y - ghost.box.y } : undefined}>
        {ghost.text}
      </span>
    </span>
  );
}

export function TagInput({
  value,
  defaultValue,
  onValueChange,
  validate,
  resolve,
  suggestions,
  normalize = SAME,
  separators = SEPARATORS,
  max,
  limitMessage = "No room for more",
  createLabel = CREATE,
  collapse,
  label = "Add tags",
  placeholder,
  hint,
  name,
  disabled = false,
  ref,
  className = "",
  ...props
}: TagInputProps) {
  const reduced = useReducedMotion();
  const uid = React.useId();
  const [own, setOwn] = React.useState<TagInputTag[]>(defaultValue ?? EMPTY);
  const tags = value ?? own;
  const tagsRef = React.useRef(tags);
  tagsRef.current = tags;
  const [text, setText] = React.useState("");
  const [resolving, setResolving] = React.useState<ReadonlySet<string>>(() => new Set());
  const [selected, setSelected] = React.useState<string | null>(null);
  const [within, setWithin] = React.useState(false);
  const [inputFocus, setInputFocus] = React.useState(false);
  const [options, setOptions] = React.useState<TagInputSuggestion[]>([]);
  const [active, setActive] = React.useState(-1);
  const [dismissed, setDismissed] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [ghosts, setGhosts] = React.useState<Ghost[]>([]);
  const [announce, setAnnounce] = React.useState("");
  const [tick, setTick] = React.useState(0);
  const [cut, setCut] = React.useState<{ hidden: string[]; x: number; y: number; height: number } | null>(null);
  const pending = React.useRef<Pending | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const fieldRef = React.useRef<HTMLDivElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const mirrorRef = React.useRef<HTMLSpanElement>(null);
  const pillRef = React.useRef<HTMLSpanElement>(null);
  const rowRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const ghostKey = React.useRef(0);
  /** Focus we moved ourselves (after an edit or a removal) doesn't open the suggestions. */
  const quietFocus = React.useRef(false);
  /** Whether the chip being clicked was already selected: a second click (or tap) edits it. */
  const wasSelected = React.useRef(false);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const collapsed = collapse !== undefined && !within && tags.length > 0;
  const collapsedRef = React.useRef(collapsed);
  collapsedRef.current = collapsed;

  const commit = (next: TagInputTag[]) => {
    tagsRef.current = next;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const say = (message: string) => setAnnounce((a) => (a === message ? `${message} ` : message));
  const flash = (message: string, tone: Notice["tone"]) => {
    const key = Date.now();
    setNotice({ text: message, tone, key });
    window.setTimeout(() => setNotice((n) => (n?.key === key ? null : n)), 2600);
  };

  // ── Measuring ──────────────────────────────────────────
  /** From list coordinates to the root's, where ghosts live. */
  const rootOffset = () => {
    const list = listRef.current?.getBoundingClientRect();
    const root = rootRef.current?.getBoundingClientRect();
    return list && root ? { dx: list.left - root.left, dy: list.top - root.top } : { dx: 0, dy: 0 };
  };
  const textWidth = (s: string) => {
    const m = mirrorRef.current;
    if (!m) return s.length * 7;
    m.textContent = s;
    return m.offsetWidth;
  };
  /** Where a stretch of the input's text is drawn, in list coordinates. */
  const textBox = (start: number, s: string): TokenBox | null => {
    const input = inputRef.current;
    const list = listRef.current;
    if (!input || !list) return null;
    const i = input.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    const h = 18;
    return { x: i.left - l.left + textWidth(input.value.slice(0, start)) - input.scrollLeft, y: i.top - l.top + (i.height - h) / 2, w: Math.max(1, textWidth(s)), h };
  };
  const caretPoint = () => {
    const input = inputRef.current;
    const b = textBox(input?.selectionStart ?? text.length, "") ?? { x: PAD, y: PAD, w: 1, h: 18 };
    return { x: b.x, y: b.y + b.h / 2 - CHIP_H / 2 };
  };

  // ── Changes ────────────────────────────────────────────
  /** Queue a change to play after React lays it out. Changes in the same render merge; the earliest snapshot wins. */
  const stage = (p: Partial<Pending>, before?: TokenSnapshot | null) => {
    const prev = pending.current;
    pending.current = {
      ...prev,
      ...p,
      before: prev ? prev.before : (before ?? (listRef.current ? snapshotTokens(listRef.current) : null)),
      enter: new Map([...(prev?.enter ?? []), ...(p.enter ?? [])]),
      ghosts: [...(prev?.ghosts ?? []), ...(p.ghosts ?? [])],
      flights: [...(prev?.flights ?? []), ...(p.flights ?? [])],
      shake: [...(prev?.shake ?? []), ...(p.shake ?? [])],
    };
    setTick((t) => t + 1);
  };

  const plan = (drafts: Draft[], base: TagInputTag[]) => {
    const next = base.slice();
    const added: TagInputTag[] = [];
    const dups: { draft: Draft; twin: string; index: number; after: string | null }[] = [];
    let overflow = 0;
    let index = 0;
    for (const d of drafts) {
      const v = normalize(d.value.trim());
      if (!v) continue;
      const twin = next.find((t) => t.value === v);
      if (twin) {
        dups.push({ draft: { ...d, value: v }, twin: twin.id, index: index++, after: next[next.length - 1]?.id ?? null });
        continue;
      }
      index++;
      if (max !== undefined && next.length >= max) {
        overflow++;
        continue;
      }
      const error = (validate?.(v) as string | null | undefined) || undefined;
      const tag: TagInputTag = { id: newId(), value: v, ...(d.label ? { label: d.label } : {}), ...(d.image ? { image: d.image } : {}), ...(error ? { error } : {}) };
      next.push(tag);
      added.push(tag);
    }
    return { next, added, dups, overflow };
  };

  const lookUp = (added: TagInputTag[]) => {
    if (!resolve) return;
    const run = added.filter((t) => !t.error && !t.label);
    if (!run.length) return;
    setResolving((s) => new Set([...s, ...run.map((t) => t.id)]));
    for (const tag of run) {
      Promise.resolve()
        .then(() => resolve(tag.value))
        .catch(() => null)
        .then((result) => {
          if (!alive.current) return;
          const found = result as { label?: string; image?: string } | null | undefined;
          const fill = found && (found.label || found.image) ? { ...(found.label ? { label: found.label } : {}), ...(found.image ? { image: found.image } : {}) } : null;
          const current = tagsRef.current;
          stage({});
          setResolving((s) => {
            const n = new Set(s);
            n.delete(tag.id);
            return n;
          });
          if (fill && current.some((t) => t.id === tag.id)) {
            commit(current.map((t) => (t.id === tag.id ? { ...t, ...fill } : t)));
            if (fill.label) say(`${tag.value} is ${fill.label}.`);
          }
        });
    }
  };

  /** Adds values however they came: typed (the letters stay put), pasted (they spill from the caret) or picked (carried from the list). */
  const add = (drafts: Draft[], how: How) => {
    const result = plan(drafts, tagsRef.current);
    const { dx, dy } = rootOffset();
    const delayOf = (i: number) => ("paste" in how ? Math.min(i * 50, 500) : 0);
    const enter = new Map<string, TokenEnter>();
    const shake: Pending["shake"] = [];
    const flights: Flight[] = [];

    result.added.forEach((t, i) => {
      if ("type" in how) enter.set(t.id, how.type ? { from: "text", box: how.type } : { from: "text" });
      else if ("paste" in how) enter.set(t.id, { from: "point", x: how.paste.x, y: how.paste.y, delay: delayOf(i) });
      else {
        enter.set(t.id, { from: "text", hold: 480 });
        flights.push({ kind: "carry", text: display(t), from: how.pick, twin: t.id, delay: 0 });
      }
      if (t.error) shake.push({ id: t.id, delay: delayOf(i) + 380 });
    });

    result.dups.forEach((d) => {
      const word = display(d.draft);
      const w = textWidth(word) * (13 / 14) + 20;
      // A typed or picked repeat leaves from where it was; a pasted one turns up, in its turn, where it would have gone.
      const from =
        "pick" in how
          ? { x: how.pick.x - 10, y: how.pick.y + how.pick.h / 2 - CHIP_H / 2, w, h: CHIP_H }
          : "paste" in how
            ? { after: d.after, w }
            : how.type
              ? { x: how.type.x - 10 + dx, y: how.type.y + how.type.h / 2 - CHIP_H / 2 + dy, w, h: CHIP_H }
              : { x: dx, y: dy, w, h: CHIP_H };
      flights.push({ kind: "fly", text: word, from, twin: d.twin, delay: delayOf(d.index) });
    });

    stage({ enter, shake, flights, skipInput: "type" in how && !!how.type, shakeField: result.overflow > 0 });
    if (result.added.length) commit(result.next);
    // The list stays closed until you type again.
    setDismissed(true);
    lookUp(result.added);

    if (result.overflow) flash(limitMessage, "warn");
    else if (result.dups.length)
      flash(result.dups.length === 1 ? `${display(result.dups[0].draft)} is already here` : `${result.dups.length} were already here`, "muted");
    const invalid = result.added.filter((t) => t.error).length;
    say(
      [
        result.added.length === 1 ? `Added ${display(result.added[0])}.` : result.added.length ? `Added ${result.added.length}.` : "",
        invalid ? `${invalid} not valid.` : "",
        result.dups.length ? `${result.dups.length} already added.` : "",
        result.overflow ? `${limitMessage}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  };

  /** The typed text becomes a chip where it stands. */
  const commitText = (raw = text) => {
    const words = raw.split(separators).filter((w) => w.trim());
    if (!words.length) return;
    if (words.length > 1) {
      const point = caretPoint();
      setText("");
      add(words.map((w) => ({ value: w })), { paste: point });
      return;
    }
    const lead = raw.length - raw.trimStart().length;
    const box = raw === text ? textBox(lead, words[0].trim()) : null;
    setText("");
    add([{ value: words[0] }], { type: box });
  };

  const pasteText = (pasted: string, start: number, end: number) => {
    const combined = text.slice(0, start) + pasted + text.slice(end);
    const point = caretPoint();
    setText("");
    add(combined.split(separators).map((w) => ({ value: w })), { paste: point });
  };

  const ghostOf = (t: TagInputTag, kind: Ghost["kind"], snap: TokenSnapshot): Ghost | null => {
    const was = snap.chips.get(t.id);
    if (!was) return null;
    const { dx, dy } = rootOffset();
    const named = !!t.label && t.label !== t.value;
    return {
      key: ++ghostKey.current,
      kind,
      text: display(t),
      box: shift(was.screen, dx, dy),
      inner: shift(was.screenLabel, dx, dy),
      error: !!t.error,
      avatar: !t.error && (t.image || named) ? { image: t.image, name: display(t) } : undefined,
    };
  };

  const remove = (id: string, focus?: "input" | string) => {
    const tag = tagsRef.current.find((t) => t.id === id);
    const list = listRef.current;
    if (!tag || !list || disabled) return;
    const before = snapshotTokens(list);
    const ghost = ghostOf(tag, "leave", before);
    stage({ ghosts: ghost ? [ghost] : [], focus }, before);
    commit(tagsRef.current.filter((t) => t.id !== id));
    say(`Removed ${display(tag)}.`);
  };

  /** Back to text: the shell drops away and its letters become what you're typing. */
  const edit = (id: string) => {
    const tag = tagsRef.current.find((t) => t.id === id);
    const list = listRef.current;
    if (!tag || !list || disabled) return;
    const before = snapshotTokens(list);
    const ghost = ghostOf(tag, "unspool", before);
    // Anything already typed becomes chips first.
    const typed = plan(
      text
        .split(separators)
        .filter((w) => w.trim())
        .map((w) => ({ value: w })),
      tagsRef.current.filter((t) => t.id !== id),
    );
    stage(
      {
        ghosts: ghost ? [ghost] : [],
        skipInput: true,
        inputFrom: ghost?.inner ? { box: ghost.inner, fade: display(tag) !== tag.value } : undefined,
        focus: "input",
      },
      before,
    );
    commit(typed.next);
    lookUp(typed.added);
    setText(tag.value);
    setDismissed(true);
    say(`Editing ${tag.value}.`);
  };

  const clear = () => {
    const list = listRef.current;
    if (!list || !tagsRef.current.length) return;
    const before = snapshotTokens(list);
    stage({ ghosts: tagsRef.current.flatMap((t) => ghostOf(t, "leave", before) ?? []) }, before);
    commit([]);
    say("Cleared.");
  };

  React.useImperativeHandle(ref, () => ({ paste: (s: string) => pasteText(s, text.length, text.length), focus: () => inputRef.current?.focus(), clear }));

  // ── Playing a change ───────────────────────────────────
  // TextMorph commits a label's new letters one render after it gets the text, so measure one render later (still before
  // paint): otherwise a chip that resolves to a shorter name would change width after the glide was measured.
  const [playTick, setPlayTick] = React.useState(0);
  React.useLayoutEffect(() => {
    if (pending.current) setPlayTick((t) => t + 1);
  }, [tick]);
  React.useLayoutEffect(() => {
    const p = pending.current;
    const list = listRef.current;
    if (!p || !list) return;
    pending.current = null;
    const after = p.before ? playTokens(list, p.before, { enter: p.enter, skipInput: p.skipInput, reduced }) : snapshotTokens(list);
    const chip = (id: string) => list.querySelector<HTMLElement>(`[data-token="${CSS.escape(id)}"]`);
    p.shake.forEach((s) => shakeToken(chip(s.id), reduced, s.delay));
    if (p.shakeField) shakeToken(fieldRef.current, reduced);

    if (!reduced) {
      const { dx, dy } = rootOffset();
      const flights: Ghost[] = p.flights.flatMap((f) => {
        const twin = after.chips.get(f.twin);
        if (!twin) return [];
        let box: TokenBox;
        if ("after" in f.from) {
          // Where it would have landed: after the chip before it, or at the start of the next line if it doesn't fit.
          const prev = f.from.after ? after.chips.get(f.from.after)?.box : undefined;
          let x = prev ? prev.x + prev.w + GAP : PAD;
          let y = prev ? prev.y : PAD;
          if (x + f.from.w > list.clientWidth - PAD) {
            x = PAD;
            y += CHIP_H + PAD;
          }
          box = { x: x + dx, y: y + dy, w: f.from.w, h: CHIP_H };
        } else box = f.from;
        return [{ key: ++ghostKey.current, kind: f.kind, text: f.text, box, to: shift(f.kind === "carry" ? twin.label : twin.box, dx, dy), twin: f.twin, delay: f.delay, appear: "after" in f.from }];
      });
      if (p.ghosts.length || flights.length) setGhosts((g) => [...g, ...p.ghosts, ...flights]);

      const input = inputRef.current;
      if (p.inputFrom && input) {
        const i = input.getBoundingClientRect();
        const root = rootRef.current!.getBoundingClientRect();
        const from = p.inputFrom.box;
        input.parentElement!.animate(
          [{ transform: `translate(${from.x - (i.left - root.left)}px, ${from.y + from.h / 2 - (i.top - root.top + i.height / 2)}px)` }, { transform: "none" }],
          { duration: 440, easing: EASE },
        );
        if (p.inputFrom.fade)
          input.animate([{ opacity: 0, filter: "blur(4px)" }, { opacity: 1, filter: "blur(0px)" }], { duration: 360, delay: 80, easing: EASE, fill: "backwards" });
      }
    }

    const input = inputRef.current;
    if (p.focus === "input" && input) {
      quietFocus.current = document.activeElement !== input;
      input.focus({ preventScroll: true });
      const end = input.value.length;
      input.setSelectionRange(end, end);
    } else if (p.focus) chip(p.focus)?.focus({ preventScroll: true });
    // Widths settle here (after TextMorph), so the folded count is measured again too.
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playTick]);

  const ghostDone = React.useCallback(
    (ghost: Ghost) => {
      setGhosts((g) => g.filter((x) => x.key !== ghost.key));
      if (ghost.kind === "fly" && ghost.twin) pulseToken(listRef.current?.querySelector<HTMLElement>(`[data-token="${CSS.escape(ghost.twin)}"]`), reduced);
    },
    [reduced],
  );

  // ── Height and collapse ────────────────────────────────
  const measure = React.useCallback(() => {
    const list = listRef.current;
    const wrap = wrapRef.current;
    if (!list || !wrap) return;
    let next: typeof cut = null;
    if (collapsedRef.current && collapse !== undefined) {
      const chips = Array.from(list.querySelectorAll<HTMLElement>("[data-token]"));
      const lines = [...new Set(chips.map((c) => c.offsetTop))].sort((a, b) => a - b);
      if (lines.length > collapse) {
        const last = lines[Math.max(0, collapse - 1)];
        const limit = list.clientWidth - PAD - (pillRef.current?.offsetWidth ?? 40) - GAP;
        const hidden: string[] = [];
        let x = PAD;
        for (const c of chips) {
          if (c.offsetTop < last) continue;
          if (c.offsetTop === last && !hidden.length && c.offsetLeft + c.offsetWidth <= limit) x = c.offsetLeft + c.offsetWidth + GAP;
          else hidden.push(c.dataset.token!);
        }
        next = { hidden, x, y: last, height: last + CHIP_H + PAD };
      }
    }
    setCut((c) => (c === next || (c && next && c.x === next.x && c.y === next.y && c.height === next.height && c.hidden.join() === next.hidden.join()) ? c : next));
    const target = `${next ? next.height : list.offsetHeight}px`;
    if (wrap.style.height !== target) {
      wrap.style.transition = wrap.dataset.ready && !reduced ? `height 420ms ${EASE}` : "none";
      wrap.style.height = target;
      wrap.dataset.ready = "1";
    }
  }, [collapse, reduced]);

  React.useLayoutEffect(() => {
    measure();
  }, [measure, collapsed, tags, resolving]);

  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(list);
    return () => observer.disconnect();
  }, [measure]);

  // ── Suggestions ────────────────────────────────────────
  React.useEffect(() => {
    if (!suggestions || !inputFocus) return;
    const q = text.trim().toLowerCase();
    const taken = new Set(tags.map((t) => t.value));
    const keep = (found: TagInputSuggestion[]) => found.filter((s) => !taken.has(normalize(s.value))).slice(0, 6);
    if (Array.isArray(suggestions)) {
      setOptions(keep(q ? suggestions.filter((s) => [s.value, s.label, s.description].some((f) => f?.toLowerCase().includes(q))) : suggestions));
      return;
    }
    let live = true;
    Promise.resolve(suggestions(text.trim())).then((found) => {
      if (live) setOptions(keep(found));
    });
    return () => {
      live = false;
    };
  }, [text, tags, suggestions, inputFocus, normalize]);

  const query = text.trim();
  const exact = options.some((o) => normalize(o.value) === normalize(query) || o.label?.toLowerCase() === query.toLowerCase());
  const rows: Row[] = [...options, ...(createLabel && query && !exact ? [{ value: query, label: createLabel(query), create: true }] : [])];
  const open = !!suggestions && inputFocus && !dismissed && rows.length > 0 && !disabled;
  const activeRow = open ? Math.min(active, rows.length - 1) : -1;
  // While the list folds away it keeps the rows it had, rather than flashing what an empty query would match.
  const lastRows = React.useRef(rows);
  if (open) lastRows.current = rows;
  const shownRows = open ? rows : lastRows.current;

  // The first match is ready for Enter while you type; nothing is while the field is empty.
  React.useEffect(() => {
    setActive(text.trim() ? 0 : -1);
  }, [text, options.length]);

  const pick = (row: Row, index: number) => {
    setDismissed(true);
    if (row.create) return commitText(row.value);
    const label = rowRefs.current[index]?.querySelector("[data-option-label]")?.getBoundingClientRect();
    const root = rootRef.current!.getBoundingClientRect();
    const from = label ? { x: label.left - root.left, y: label.top - root.top, w: label.width, h: label.height } : { x: 0, y: 0, w: 1, h: 18 };
    setText("");
    add([{ value: row.value, label: row.label, image: row.image }], { pick: from });
  };

  // The highlight glides between rows; its first placement doesn't.
  const [mark, setMark] = React.useState({ y: 0, h: 0, on: false, slide: false });
  React.useLayoutEffect(() => {
    const el = rowRefs.current[activeRow];
    setMark((m) => {
      if (!el) return m.on ? { ...m, on: false, slide: false } : m;
      const next = { y: el.offsetTop, h: el.offsetHeight, on: true, slide: m.on };
      return m.y === next.y && m.h === next.h && m.on === next.on && m.slide === next.slide ? m : next;
    });
  }, [activeRow, rows.length, open]);
  React.useEffect(() => {
    if (activeRow >= 0) rowRefs.current[activeRow]?.scrollIntoView({ block: "nearest" });
  }, [activeRow]);

  // ── Keys ───────────────────────────────────────────────
  const ids = tags.map((t) => t.id);
  const focusChip = (id: string | undefined) => {
    if (!id) return inputRef.current?.focus();
    listRef.current?.querySelector<HTMLElement>(`[data-token="${CSS.escape(id)}"]`)?.focus();
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const n = rows.length;
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : a <= 0 ? n - 1 : a - 1));
    } else if (e.key === "ArrowDown" && suggestions && dismissed) {
      e.preventDefault();
      setDismissed(false);
    } else if (e.key === "Enter") {
      if (open && activeRow >= 0) {
        e.preventDefault();
        pick(rows[activeRow], activeRow);
      } else if (text.trim()) {
        e.preventDefault();
        commitText();
      }
    } else if (e.key === "Tab" && !e.shiftKey && text.trim()) {
      commitText();
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setDismissed(true);
    } else if ((e.key === "Backspace" || e.key === "ArrowLeft") && input.selectionStart === 0 && input.selectionEnd === 0 && ids.length) {
      e.preventDefault();
      focusChip(ids[ids.length - 1]);
    }
  };

  const onChipKey = (e: React.KeyboardEvent<HTMLElement>, id: string) => {
    const i = ids.indexOf(id);
    const keys: Record<string, () => void> = {
      ArrowLeft: () => focusChip(ids[Math.max(0, i - 1)]),
      ArrowRight: () => focusChip(ids[i + 1]),
      Home: () => focusChip(ids[0]),
      End: () => focusChip(undefined),
      Escape: () => focusChip(undefined),
      Backspace: () => edit(id),
      Enter: () => edit(id),
      Delete: () => remove(id, ids[i + 1] ?? "input"),
    };
    const run = keys[e.key];
    if (!run) return;
    e.preventDefault();
    run();
  };

  const onType = (next: string) => {
    if (!separators.test(next)) {
      setDismissed(false);
      return setText(next);
    }
    const words = next.split(separators);
    const rest = words.pop() ?? "";
    const done = words.filter((w) => w.trim());
    if (done.length === 1) {
      const lead = next.length - next.trimStart().length;
      const box = textBox(lead, done[0].trim());
      setText(rest);
      add([{ value: done[0] }], { type: box });
    } else if (done.length > 1) {
      const point = caretPoint();
      setText(rest);
      add(done.map((w) => ({ value: w })), { paste: point });
    } else setText(rest);
  };

  // ── Render ─────────────────────────────────────────────
  const invalid = tags.find((t) => t.error);
  const line = notice ?? (invalid ? { text: invalid.error!, tone: "error" as const } : hint ? { text: hint, tone: "muted" as const } : null);
  const lineId = `${uid}-line`;
  const listId = `${uid}-options`;
  const hidden = new Set(cut?.hidden ?? []);
  const tone = line?.tone === "error" ? "text-red-600 dark:text-red-400" : line?.tone === "warn" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground";

  return (
    <div
      ref={rootRef}
      className={`relative w-full text-foreground ${className}`}
      onFocus={() => setWithin(true)}
      onBlur={(e) => {
        const root = e.currentTarget;
        // A chip that's removed while focused takes focus with it for a moment; look again once things settle.
        requestAnimationFrame(() => {
          if (root.contains(document.activeElement)) return;
          setWithin(false);
          setSelected(null);
        });
      }}
      {...props}
    >
      <span ref={mirrorRef} aria-hidden="true" className="pointer-events-none invisible absolute start-0 top-0 whitespace-pre text-[14px] [@media(pointer:coarse)]:text-[16px]" />

      <div className="relative">
        <div
          ref={fieldRef}
          onMouseDown={(e) => {
            if (disabled || (e.target as HTMLElement).closest("[data-token], button, input")) return;
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className={`cursor-text rounded-[19px] border bg-background transition-[border-color,opacity] duration-200 ${disabled ? "cursor-default opacity-60" : ""}`}
          style={{ borderColor: inputFocus ? "color-mix(in oklab, var(--ring) 55%, var(--border))" : "var(--border)" }}
        >
          {/* clip, not hidden: a hidden box can still be scrolled, and focusing the input would scroll the chips away. */}
          <div ref={wrapRef} className="overflow-clip">
            <div ref={listRef} className="relative flex flex-wrap items-center gap-x-1.5" style={{ padding: PAD, rowGap: PAD }}>
              <div role="list" aria-label={label} className="contents">
                {tags.map((t, i) => {
                  const busy = resolving.has(t.id);
                  const shown = display(t);
                  const named = !!t.label && t.label !== t.value;
                  const slot = busy || !!t.error || !!t.image || named;
                  const gone = hidden.has(t.id);
                  return (
                    <span
                      key={t.id}
                      data-token={t.id}
                      role="listitem"
                      tabIndex={-1}
                      aria-label={`${shown}${named ? `, ${t.value}` : ""}${t.error ? `, ${t.error}` : ""}${busy ? ", looking up" : ""}`}
                      aria-describedby={`${uid}-keys`}
                      title={shown.length > LONG ? shown : undefined}
                      onFocus={() => setSelected(t.id)}
                      onBlur={() => setSelected((s) => (s === t.id ? null : s))}
                      onKeyDown={(e) => onChipKey(e, t.id)}
                      onMouseDown={() => {
                        wasSelected.current = selected === t.id;
                      }}
                      onClick={(e) => {
                        if (wasSelected.current && !(e.target as HTMLElement).closest("button")) edit(t.id);
                      }}
                      className={`relative inline-flex h-7 max-w-full shrink-0 cursor-default select-none items-center rounded-full text-[13px] outline-none will-change-transform ${
                        t.error ? "text-red-600 dark:text-red-400" : "text-foreground"
                      }`}
                      style={{
                        opacity: gone ? 0 : 1,
                        filter: gone ? "blur(3px)" : "none",
                        pointerEvents: gone ? "none" : undefined,
                        transition: reduced ? "none" : `opacity 260ms ${EASE} ${gone ? 0 : Math.min(i * 18, 180)}ms, filter 260ms ${EASE}`,
                      }}
                    >
                      <span
                        data-token-shell=""
                        aria-hidden="true"
                        className="absolute inset-y-0 start-0 w-full rounded-full transition-[background-color,box-shadow] duration-200"
                        style={shellStyle(!!t.error, selected === t.id)}
                      />
                      <span data-token-extra="" aria-hidden="true" className="relative flex h-5 shrink-0 items-center justify-center" style={{ width: slot ? 20 : 0, marginInlineStart: slot ? 4 : 0 }}>
                        <span className="absolute inset-0 flex items-center justify-center" style={swap(busy, reduced)}>
                          <span className={`size-3 rounded-full border-[1.5px] border-current border-t-transparent text-muted-foreground motion-reduce:animate-none ${busy ? "animate-spin" : ""}`} />
                        </span>
                        <span className="absolute inset-0 flex items-center justify-center" style={swap(!busy && !!t.error, reduced)}>
                          <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
                            <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M8 4.75v3.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                            <circle cx="8" cy="11" r="1" fill="currentColor" />
                          </svg>
                        </span>
                        <span className="absolute inset-0 flex items-center justify-center" style={swap(!busy && !t.error && (!!t.image || named), reduced)}>
                          {(t.image || named) && <Avatar image={t.image} name={shown} size={20} />}
                        </span>
                      </span>
                      {/* Only a long label clips (inside its own box, which is what glides): a short one never cuts the letters
                          of the address it's morphing from. */}
                      <span
                        data-token-label=""
                        className={`relative whitespace-nowrap py-1 ${shown.length > LONG ? "min-w-0 max-w-[11rem] overflow-hidden" : ""}`}
                        style={{ marginInlineStart: slot ? 6 : 10, marginInlineEnd: 2 }}
                      >
                        <TextMorph animateWidth={false} aria-hidden="true">
                          {shown}
                        </TextMorph>
                      </span>
                      <button
                        type="button"
                        data-token-extra=""
                        tabIndex={-1}
                        aria-label={`Remove ${shown}`}
                        disabled={disabled}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => remove(t.id, rootRef.current?.contains(document.activeElement) ? "input" : undefined)}
                        className="relative me-1 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default"
                      >
                        <Cross />
                      </button>
                    </span>
                  );
                })}
              </div>

              <span data-token-input="" className="flex h-7 items-center ps-1.5" style={{ flex: collapsed ? "0 0 0px" : "1 1 7rem", minWidth: collapsed ? 0 : "7rem" }}>
                <input
                  ref={inputRef}
                  value={text}
                  disabled={disabled}
                  placeholder={tags.length ? undefined : placeholder}
                  role="combobox"
                  aria-label={label}
                  aria-expanded={open}
                  aria-controls={open ? listId : undefined}
                  aria-activedescendant={activeRow >= 0 ? `${uid}-opt-${activeRow}` : undefined}
                  aria-autocomplete={suggestions ? "list" : undefined}
                  aria-describedby={line ? lineId : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  onFocus={() => {
                    setInputFocus(true);
                    if (!quietFocus.current) setDismissed(false);
                    quietFocus.current = false;
                  }}
                  onBlur={(e) => {
                    setInputFocus(false);
                    if (!rootRef.current?.contains(e.relatedTarget as Node | null) && text.trim()) commitText();
                  }}
                  onChange={(e) => onType(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text");
                    if (!separators.test(pasted)) return;
                    e.preventDefault();
                    pasteText(pasted, e.currentTarget.selectionStart ?? text.length, e.currentTarget.selectionEnd ?? text.length);
                  }}
                  onKeyDown={onInputKey}
                  className="h-7 w-full min-w-0 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground disabled:cursor-default [@media(pointer:coarse)]:text-[16px]"
                />
              </span>

              {/* What folded away, counted at the end of the last line that shows. */}
              <span
                ref={pillRef}
                aria-hidden="true"
                onMouseDown={(e) => {
                  e.preventDefault();
                  inputRef.current?.focus();
                }}
                className="absolute start-0 top-0 inline-flex h-7 cursor-pointer items-center rounded-full px-2.5 text-[12.5px] tabular-nums text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]"
                style={{
                  transform: `translate(${cut?.x ?? PAD}px, ${cut?.y ?? PAD}px)`,
                  opacity: cut ? 1 : 0,
                  filter: cut ? "none" : "blur(3px)",
                  pointerEvents: cut ? undefined : "none",
                  transition: reduced ? "none" : `opacity 260ms ${EASE} ${cut ? 120 : 0}ms, filter 260ms ${EASE}`,
                }}
              >
                +<NumberRoll value={cut?.hidden.length ?? 0} duration={600} />
              </span>
            </div>
          </div>
        </div>

        {/* Suggestions open clear of the field and unfold from its edge. */}
        <div
          className="absolute inset-x-0 top-full z-20 pt-1.5"
          style={{
            clipPath: open ? "inset(0px -2px -2px -2px)" : "inset(0px -2px 100% -2px)",
            opacity: open ? 1 : 0,
            visibility: open ? "visible" : "hidden",
            transition: reduced ? "none" : `clip-path 340ms ${EASE}, opacity 200ms ${EASE}, visibility 0s linear ${open ? "0s" : "340ms"}`,
          }}
        >
          <div
            role="listbox"
            id={listId}
            aria-label={`${label}: suggestions`}
            onMouseDown={(e) => e.preventDefault()}
            className="relative max-h-64 overflow-auto rounded-[14px] border border-border bg-popover p-1 text-popover-foreground"
          >
            <span
              aria-hidden="true"
              className="absolute inset-x-1 top-0 rounded-[10px] bg-accent"
              style={{
                transform: `translateY(${mark.y}px)`,
                height: mark.h,
                opacity: mark.on ? 1 : 0,
                transition: reduced ? "none" : `${mark.slide ? `transform 260ms ${EASE}, height 260ms ${EASE}, ` : ""}opacity 160ms ${EASE}`,
              }}
            />
            {shownRows.map((row, i) => (
              <div
                key={`${row.create ? "create" : "row"}-${row.value}`}
                id={`${uid}-opt-${i}`}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                role="option"
                aria-selected={i === activeRow}
                onMouseMove={() => i !== activeRow && setActive(i)}
                onClick={() => pick(row, i)}
                className="relative flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[10px] px-2 py-1.5"
              >
                {row.create ? (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]">
                    <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden="true">
                      <path d="M6 2.5v7M2.5 6h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </span>
                ) : (
                  (row.image || row.label) && <Avatar image={row.image} name={display(row)} size={24} />
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13.5px] leading-tight">
                    <span data-option-label="">{display(row)}</span>
                  </span>
                  {!row.create && (row.description || (row.label && row.label !== row.value)) && (
                    <span className="truncate text-[12px] leading-tight text-muted-foreground">{row.description ?? row.value}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hint, error or notice: one line that morphs, and folds away when there's nothing to say. */}
      <div className="grid transition-[grid-template-rows] duration-300" style={{ gridTemplateRows: line ? "1fr" : "0fr", transitionTimingFunction: EASE }}>
        <div className="min-w-0 overflow-hidden">
          <p id={lineId} className={`ps-1 pt-2 text-[12.5px] transition-colors duration-300 ${tone}`}>
            <Line text={line?.text ?? ""} reduced={reduced} />
          </p>
        </div>
      </div>

      {/* Ghosts: chips that leave, fly into a twin, drop their shell, or carry a name in. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30">
        {ghosts.map((g) => (
          <GhostChip key={g.key} ghost={g} onDone={ghostDone} />
        ))}
      </div>

      {name && <input type="hidden" name={name} value={tags.filter((t) => !t.error).map((t) => t.value).join(",")} />}
      <p id={`${uid}-keys`} className="sr-only">
        Backspace edits, Delete removes, arrow keys move between tags.
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
