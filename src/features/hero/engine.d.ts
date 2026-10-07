/**
 * The shape of the scene engine (engine.js), for scene.ts.
 *
 * The engine is plain script, kept as shipped, so its types are written here
 * and not inferred from it. Only what scene.ts and the test use is declared.
 */

/** What the engine reports each time the typed part of the headline changes. */
export type EngineHeadline = {
  /** The accent words as far as they are typed, from none to all of them. */
  accentText: string;
  /** Whether the caret shows. */
  caret: boolean;
  /** The accent's underline: absent, drawing in, drawn, or drawing out. */
  ul: "none" | "grow" | "full" | "shrink";
};

/** The settings a board hands the engine beside its scene and form. */
export type EngineProps = {
  /** `continuous` never repeats; `cycle` reels the network in and starts over. */
  field?: "continuous" | "cycle";
  /** Any text containing `once` types the accent a single time and keeps it. */
  headline?: string;
  /** How bright the scene's lights are; 1 is as drawn. */
  intensity?: number;
  /** Which seeded variation of the network to draw. */
  variation?: number;
};

export type EngineConfig = {
  /** The element the scene lives in: measured, listened on and observed. */
  root: HTMLElement;
  /** The canvas the scene paints, sized to `root` by the page's own styles. */
  canvas: HTMLCanvasElement;
  /** The scene's registered name. This build carries one, `mind`. */
  scene: string;
  /** Kept on the engine's environment. The `mind` scene does not read it. */
  form?: string;
  /** Kept on the engine's environment. The `mind` scene does not read it. */
  layout?: Readonly<Record<string, string | number>>;
  /** The words the headline types. */
  accent?: string;
  props?: EngineProps;
  onHeadline?: (state: EngineHeadline) => void;
  onReplay?: () => void;
};

export type EngineHandle = {
  setProps(props: EngineProps): void;
  /** Stops the loop and gives back every listener and observer. */
  destroy(): void;
  replay(): void;
  measure(): void;
};

declare const NH: {
  create(config: EngineConfig): EngineHandle;
  /** The emblem's view box, as `[x, y, width, height]`. */
  MARK_VB: readonly [number, number, number, number];
  /** The emblem's three shapes: tower, shield and wave. */
  BODY_D: readonly string[];
  /** The head and neck cut out of the shield. */
  HEAD_D: string;
};

export default NH;
