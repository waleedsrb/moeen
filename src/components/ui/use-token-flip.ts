// Hairline UI · tag-input · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

/* ─────────────────────────────────────────────────────────
 * TOKEN FLIP: chips that keep their place on screen
 *
 *   snapshot  where every chip, its label and the input sit in
 *             the layout, plus where they are on screen right
 *             now; taken at the keystroke, the paste or the
 *             click, never at the last render
 *   play      after React lays the new order out, every chip
 *             glides from its old place to its new one. Glides
 *             are additive: a change that lands mid-glide (a name
 *             resolving while a paste is still landing) adds its
 *             own offset on top, so nothing restarts or jumps.
 *             A chip that changed width eases its shell; a new
 *             chip grows its shell round the letters you typed,
 *             or spills out of the caret when pasted.
 *   ghosts    copies that leave, or fly into a twin, live in an
 *             overlay so the real list never waits for them
 *
 * Transforms, a shell's width and a one-off clip only; nothing
 * here runs per pointer move. Elements are found by data
 * attributes: data-token, data-token-shell, data-token-label,
 * data-token-extra and data-token-input.
 * ───────────────────────────────────────────────────────── */

export type TokenBox = { x: number; y: number; w: number; h: number };
export type TokenChip = {
  /** Layout boxes in list coordinates, transforms ignored. */
  box: TokenBox;
  label: TokenBox;
  /** The shell's width as drawn right now (mid-ease included). */
  shell: number;
  /** Where the chip and its label are on screen right now, in list coordinates. */
  screen: TokenBox;
  screenLabel: TokenBox;
};
export type TokenSnapshot = { chips: Map<string, TokenChip>; input: TokenBox | null };

/**
 * How a new chip arrives. "text": its letters stay where they were typed (box) or where they are (no box) while the
 * shell grows round them; `hold` keeps them hidden while a copy is carried in. "point": it spills out of a point (paste).
 */
export type TokenEnter = { from: "text"; box?: TokenBox; delay?: number; hold?: number } | { from: "point"; x: number; y: number; delay: number };

export const TOKEN_EASE = "cubic-bezier(0.16,1,0.3,1)";
export const TOKEN_THROW = "cubic-bezier(0.34,1.36,0.64,1)";
const GLIDE = 440;
const SPILL = 560;
const ENTER = "token-enter";

const chipsOf = (list: HTMLElement) => list.querySelectorAll<HTMLElement>("[data-token]");
const part = (chip: HTMLElement, name: string) => chip.querySelector<HTMLElement>(`[data-token-${name}]`);

const screenBox = (el: Element, origin: DOMRect): TokenBox => {
  const r = el.getBoundingClientRect();
  return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
};

/** The layout box (offsets, so running transforms don't count) in list coordinates. */
function layoutBox(el: HTMLElement, list: HTMLElement, origin: DOMRect): TokenBox {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== list) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return node === list ? { x, y, w: el.offsetWidth, h: el.offsetHeight } : screenBox(el, origin);
}

export function snapshotTokens(list: HTMLElement): TokenSnapshot {
  const origin = list.getBoundingClientRect();
  const chips = new Map<string, TokenChip>();
  chipsOf(list).forEach((chip) => {
    const label = part(chip, "label") ?? chip;
    const shell = part(chip, "shell");
    chips.set(chip.dataset.token!, {
      box: layoutBox(chip, list, origin),
      label: layoutBox(label, list, origin),
      shell: shell ? parseFloat(getComputedStyle(shell).width) || chip.offsetWidth : chip.offsetWidth,
      screen: screenBox(chip, origin),
      screenLabel: screenBox(label, origin),
    });
  });
  const input = list.querySelector<HTMLElement>("[data-token-input]");
  return { chips, input: input ? layoutBox(input, list, origin) : null };
}

const moved = (dx: number, dy: number) => Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;

/** An offset that decays to nothing, added on top of whatever else is moving the element. */
function glide(el: HTMLElement, dx: number, dy: number) {
  el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }], { duration: GLIDE, easing: TOKEN_EASE, composite: "add" });
}

const stopMoving = (el: HTMLElement) =>
  el.getAnimations().forEach((a) => (a.effect as KeyframeEffect | null)?.getKeyframes().some((k) => "transform" in k) && a.cancel());

/** A pasted chip spills out of a point (list coordinates) after `delay`, and remembers it in case the layout moves first. */
function spill(chip: HTMLElement, x: number, y: number, at: TokenBox, delay: number) {
  chip.dataset.tokenFromX = String(x);
  chip.dataset.tokenFromY = String(y);
  const a = chip.animate(
    [
      { transform: `translate(${x - at.x}px, ${y - at.y}px) scale(0.86)`, opacity: 0, filter: "blur(4px)" },
      { transform: "none", opacity: 1, filter: "blur(0px)" },
    ],
    { duration: SPILL, delay, easing: TOKEN_EASE, fill: "backwards" },
  );
  a.id = ENTER;
}

/**
 * The layout moved while a chip was still spilling in. Stacking a glide on top would drift it (its own offset waits out
 * the delay while the glide decays), so aim it again: from its point if it hasn't left, or on from where it is now.
 */
function reaim(chip: HTMLElement, entry: Animation, was: TokenChip, now: TokenBox) {
  const delay = Number(entry.effect?.getTiming().delay ?? 0);
  const t = Number(entry.currentTime ?? 0);
  if (t < delay) {
    stopMoving(chip);
    spill(chip, Number(chip.dataset.tokenFromX), Number(chip.dataset.tokenFromY), now, delay - t);
    return;
  }
  const { opacity, filter } = getComputedStyle(chip);
  stopMoving(chip);
  const s = was.screen;
  const a = chip.animate(
    [
      { transform: `translate(${s.x + s.w / 2 - (now.x + now.w / 2)}px, ${s.y + s.h / 2 - (now.y + now.h / 2)}px) scale(${s.w / Math.max(1, now.w)})`, opacity, filter },
      { transform: "none", opacity: 1, filter: "blur(0px)" },
    ],
    { duration: Math.max(160, SPILL + delay - t), easing: TOKEN_EASE },
  );
  a.id = ENTER;
}

/**
 * Glide everything from `before` to where it sits now. `enter` says how chips that weren't there arrive; `skipInput`
 * keeps the input still (when typed text has just become a chip, the caret is already in place). Returns the new layout.
 */
export function playTokens(list: HTMLElement, before: TokenSnapshot, options: { enter?: Map<string, TokenEnter>; skipInput?: boolean; reduced: boolean }): TokenSnapshot {
  const { enter, skipInput, reduced } = options;
  const after = snapshotTokens(list);
  if (reduced) return after;

  for (const chip of chipsOf(list)) {
    const id = chip.dataset.token!;
    const now = after.chips.get(id)!;
    const was = before.chips.get(id);
    const shell = part(chip, "shell");
    const label = part(chip, "label");

    if (was) {
      const entry = chip.getAnimations().find((a) => a.id === ENTER && a.playState === "running");
      if (moved(was.box.x - now.box.x, was.box.y - now.box.y)) {
        if (entry) reaim(chip, entry, was, now.box);
        else glide(chip, was.box.x - now.box.x, was.box.y - now.box.y);
      }
      // Its width changed (a name arrived, an avatar opened): the shell eases from the width it's drawn at.
      if (shell && Math.abs(was.shell - now.box.w) > 0.5) {
        shell.getAnimations().forEach((a) => (a.effect as KeyframeEffect | null)?.getKeyframes().some((k) => "width" in k) && a.cancel());
        shell.animate([{ width: `${was.shell}px` }, { width: `${now.box.w}px` }], { duration: GLIDE, easing: TOKEN_EASE });
      }
      const ldx = was.label.x - was.box.x - (now.label.x - now.box.x);
      if (label && Math.abs(ldx) > 0.5) glide(label, ldx, 0);
      continue;
    }

    const how = enter?.get(id);
    if (!how) continue;
    if (how.from === "text") {
      // The letters stay where they were; the shell grows round them from their own outline.
      const L = now.label;
      const C = now.box;
      const delay = how.delay ?? 0;
      if (label && how.box) {
        label.style.transformOrigin = "left center";
        label.animate(
          [{ transform: `translate(${how.box.x - L.x}px, ${how.box.y + how.box.h / 2 - (L.y + L.h / 2)}px) scale(${how.box.w / Math.max(1, L.w)})` }, { transform: "none" }],
          { duration: GLIDE, delay, easing: TOKEN_EASE, fill: "backwards" },
        );
      }
      if (label && how.hold) label.animate([{ opacity: 0 }, { opacity: 0 }], { duration: how.hold });
      const left = Math.max(0, L.x - C.x - 3);
      const right = Math.max(0, C.x + C.w - (L.x + L.w) - 3);
      shell?.animate(
        [
          { clipPath: `inset(4px ${right}px 4px ${left}px round 999px)`, opacity: 0 },
          { clipPath: `inset(0px 0px 0px 0px round 999px)`, opacity: 1 },
        ],
        { duration: 480, delay, easing: TOKEN_EASE, fill: "backwards" },
      );
      chip.querySelectorAll<HTMLElement>("[data-token-extra]").forEach((el) =>
        el.animate(
          [
            { opacity: 0, transform: "scale(0.6)", filter: "blur(3px)" },
            { opacity: 1, transform: "none", filter: "blur(0px)" },
          ],
          { duration: 340, delay: delay + 140, easing: TOKEN_EASE, fill: "backwards" },
        ),
      );
    } else {
      // Pasted: the chip spills out of the caret and lands in its place.
      spill(chip, how.x, how.y, now.box, how.delay);
    }
  }

  const input = list.querySelector<HTMLElement>("[data-token-input]");
  if (input && before.input && after.input && !skipInput && moved(before.input.x - after.input.x, before.input.y - after.input.y))
    glide(input, before.input.x - after.input.x, before.input.y - after.input.y);
  return after;
}

/** A chip that's already here takes a little bump and its ring flashes: "this one". */
export function pulseToken(chip: HTMLElement | null | undefined, reduced: boolean) {
  if (!chip || reduced) return;
  chip.animate([{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: 420, easing: TOKEN_THROW, composite: "add" });
  part(chip, "shell")?.animate(
    [{ boxShadow: "inset 0 0 0 1px var(--ring)" }, { boxShadow: "inset 0 0 0 1px var(--ring)", offset: 0.4 }, { boxShadow: "inset 0 0 0 1px var(--border)" }],
    { duration: 900, easing: TOKEN_EASE },
  );
}

/** The no: a short shake. */
export function shakeToken(el: HTMLElement | null | undefined, reduced: boolean, delay = 0) {
  if (!el || reduced) return;
  el.animate(
    [{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "translateX(0)" }],
    { duration: 380, delay, easing: "ease-out", composite: "add" },
  );
}

/** Keyframes for a ghost leaving where it stood. */
export const LEAVE_FRAMES: Keyframe[] = [
  { opacity: 1, transform: "none", filter: "blur(0px)" },
  { opacity: 0, transform: "scale(0.86)", filter: "blur(4px)" },
];

/** Keyframes for letters carried from one box onto another (same text), landing exactly. */
export function carryFrames(from: TokenBox, to: TokenBox): Keyframe[] {
  const scale = to.w / Math.max(1, from.w);
  return [
    { transform: "none" },
    { transform: `translate(${to.x - from.x}px, ${to.y + to.h / 2 - (from.y + from.h / 2)}px) scale(${Math.min(1.2, Math.max(0.8, scale))})` },
  ];
}

/** Keyframes for a ghost flying from one box into another and dissolving as it arrives; `appear` fades it in first. */
export function flyFrames(from: TokenBox, to: TokenBox, appear = false): Keyframe[] {
  // Centre onto centre at its own size: letters that grew or shrank in flight would read as a different chip.
  const dx = to.x + to.w / 2 - (from.x + from.w / 2);
  const dy = to.y + to.h / 2 - (from.y + from.h / 2);
  return [
    ...(appear
      ? [
          { transform: "scale(0.86)", opacity: 0, filter: "blur(4px)" },
          { transform: "none", opacity: 1, filter: "blur(0px)", offset: 0.24 },
        ]
      : [{ transform: "none", opacity: 1, filter: "blur(0px)" }]),
    { transform: `translate(${dx * 0.7}px, ${dy * 0.7}px)`, opacity: 0.85, filter: "blur(0px)", offset: appear ? 0.62 : 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.92)`, opacity: 0, filter: "blur(3px)" },
  ];
}
