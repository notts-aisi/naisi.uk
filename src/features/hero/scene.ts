/**
 * The one door to the scene engine.
 *
 * `startScene` starts the scene on a canvas inside a root element and returns
 * a function that stops it. Everything the engine takes (its animation frame,
 * its listeners on the root and the document, its two observers) it gives
 * back when that function is called. Nothing else in the site imports
 * engine.js.
 *
 * The engine picks how wide a network to draw from the root's own shape, not
 * from the form it is told: six layers across the screen when the root is
 * wider than it is tall and at least 900px wide, six narrower layers above
 * the tagline from 600px, four below that. mount.ts and the stylesheet keep
 * the layout in step with that rule.
 */
import NH from "./engine.js";
import type { EngineHeadline } from "./engine.js";

export type HeroForm = "desktop" | "tablet" | "phone";
export type SceneHeadline = EngineHeadline;

/**
 * What each of the design's three boards starts the engine with, copied from
 * the boards. `layout` describes how the board lays its column out; the
 * stylesheet does that here, and the numbers ride along unchanged.
 */
export const BOARD_SETTINGS = {
  desktop: { scene: "mind", form: "desktop", layout: { content: "right", colW: 620 } },
  tablet: {
    scene: "mind",
    form: "tablet",
    layout: { markAlign: "end", markH: 200, markGap: 280, vAlign: "bottom", bottomPad: 92 },
  },
  phone: {
    scene: "mind",
    form: "phone",
    layout: { markAlign: "end", markH: 170, vAlign: "bottom", bottomPad: 40 },
  },
} as const;

/** The boards' own choices: a network that never repeats, a headline that loops. */
const BOARD_PROPS = {
  field: "continuous",
  headline: "loop like the site",
  intensity: 1,
  variation: 1,
} as const;

export type SceneSettings = {
  /** Which board's settings to start with. */
  form: HeroForm;
  /** The words the headline types. Left out, the engine types its own. */
  accent?: string;
  /** Called each time the typed part of the headline changes. */
  onHeadline?: (state: SceneHeadline) => void;
  /** Called when the engine replays its entrance. */
  onReplay?: () => void;
};

/**
 * Start the scene. Throws if the canvas cannot be drawn on, in which case
 * nothing has been taken and there is nothing to stop.
 */
export function startScene(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  settings: SceneSettings,
): () => void {
  const board = BOARD_SETTINGS[settings.form];
  const handle = NH.create({
    root,
    canvas,
    scene: board.scene,
    form: board.form,
    layout: board.layout,
    props: BOARD_PROPS,
    accent: settings.accent,
    onHeadline: settings.onHeadline,
    onReplay: settings.onReplay,
  });

  let stopped = false;
  return function stopScene() {
    if (stopped) return;
    stopped = true;
    handle.destroy();
    // The engine moves the emblem's cyan offset through these two; put it
    // back at rest so a scene stopped mid-pulse does not leave it kicked.
    root.style.removeProperty("--nh-kick");
    root.style.removeProperty("--nh-flash");
  };
}
