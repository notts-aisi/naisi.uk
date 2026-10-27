import type { CSSProperties, SVGProps } from "react";
import type { CrestKey } from "@/lib/crests/keys";

/*
  NAISI programme crests, Autumn 2026.

  Fellowships carry the emblem's shield, incubators carry its tower, and the
  glyph cut through it names the subject. The offset follows the emblem's
  rule: the whole body repeated down and to the left, never a blur or glow.

  Below 72px the small cut is drawn: the glyph is knocked clean through both
  layers and the offset sits further out, so it stays crisp down to 16px.

  Rules a maintainer has to keep:

  1. THE GEOMETRY AND THE COLOURS ARE DATA. They are the design handoff of
     26 Oct 2026, drawn again by nobody. The 32 files in public/brand/crests/
     are the same drawings, character for character, and
     tests/programme-crest.test.mjs holds the two together and pins both to
     that handoff. Never redraw, rotate, outline, shadow or recolour a crest
     outside the five themes below.
  2. A CREST IS NEVER PICKED HERE, OR BY A PROGRAMME'S NAME OR SLUG. Which
     crest a page shows is one module's answer (src/lib/crests/resolve.ts),
     from the `crest` an admin set on a course or on a programme of the
     application form. A page draws that answer with ProgrammeMark, which
     puts the NAISI emblem in a crest's place when there is none.
  3. DECORATIVE BESIDE A NAME. With no `title` the crest is hidden from
     assistive technology, which is right wherever the programme's name is
     printed beside it. Pass `title` only where the crest stands alone, and
     never let its colour carry a meaning by itself.
*/

// The four keys and the check that a value is one live in a plain module, so
// the readers of a stored crest can ask without compiling JSX. They are
// re-exported here unchanged: this file is still where a page gets them.
export { CREST_KEYS, isCrestKey } from "@/lib/crests/keys";
export type { CrestKey } from "@/lib/crests/keys";

/** night: white body, colour offset (the site). solid: colour body, white offset (dark grounds only).
 *  paper: navy body, colour offset (light grounds, print). white / navy: one ink, no offset. */
export type CrestTheme = "night" | "solid" | "paper" | "white" | "navy";

/** Fallbacks for the --programme-* tokens in src/theme/tokens.css. */
export const CREST_COLOURS: Record<CrestKey, string> = {
  "agi-strategy": "#ffc530", // Sun (emblem-daylight-sun)
  "technical-ai-safety": "#4d8eff", // Electric (electric)
  "governance-macrostrategy": "#ff4b1f", // Marker (marker)
  alignment: "#3ddc97", // Mint (new)
};

const NAVY = "#1b5577"; // emblem-navy
const WHITE = "#ffffff";
const SMALL_BELOW = 72;
const H = 150.65;

type Frame = "shield" | "tower";

const CRESTS: Record<CrestKey, { frame: Frame; glyph: string; name: string }> = {
  "agi-strategy": {
    frame: "shield",
    name: "AGI Strategy Fellowship",
    // sunrise
    glyph:
      "M63.7 57.1L63.6 56.6L63.4 55.9L62.8 55L62.4 54.6L61.8 54.2L61.3 54L60.6 53.8L59.4 53.8L58.7 54L58.2 54.2L57.6 54.6L57.2 55L56.6 55.9L56.4 56.6L56.3 57.3L56.3 66.1L56.5 66.9L57 67.7L57.6 68.4L58.4 68.9L59.1 69.1L59.8 69.2L60.6 69.2L61.3 69L61.9 68.7L62.5 68.3L63 67.7L63.4 67.1L63.6 66.4L63.7 65.7ZM35.4 68.7L34.9 68.5L34.1 68.3L33 68.4L32.5 68.5L31.8 68.8L31.4 69.1L30.9 69.6L30.3 70.6L30 71.3L30 71.8L30.1 72.9L30.2 73.4L30.6 74.1L31 74.7L31.6 75.2L39 79.7L39.9 80L40.8 80L41.7 79.9L42.5 79.5L43.1 79L43.6 78.5L43.9 77.8L44.2 77.1L44.2 76.4L44.2 75.6L44 74.9L43.7 74.3L43.2 73.7L42.6 73.2ZM88.6 75L89 74.7L89.4 74.1L89.8 73.4L89.9 72.9L90 71.8L90 71.3L89.7 70.6L89.1 69.6L88.6 69.1L88.2 68.8L87.5 68.5L87 68.4L85.9 68.3L85.1 68.5L84.5 68.8L77.1 73.5L76.5 74.1L76 74.9L75.8 75.8L75.8 76.7L75.9 77.5L76.2 78.1L76.7 78.7L77.2 79.3L77.8 79.7L78.5 79.9L79.2 80L79.9 80L80.7 79.9L81.3 79.6ZM75.1 83.1L74.5 81.7L73.7 80.3L72.9 79L71.9 77.8L70.7 76.6L69.5 75.6L67.5 74.4L66.1 73.7L64.6 73.2L63.1 72.8L61.6 72.6L60 72.5L58.4 72.6L56.1 73L53.9 73.7L52.5 74.4L51.1 75.2L49.8 76.1L48.7 77.2L47.1 79L45.9 81L44.9 83.1L44.5 84.6L44.2 86L44 86L44 88.5L33 88.5L32.3 88.5L31.5 88.8L30.7 89.1L30 89.7L29.4 90.3L29 90.9L28.7 91.7L28.5 92.3L28.5 93.2L28.6 94.1L29.1 95.3L29.7 96L30.1 96.5L31.3 97.2L31.9 97.4L32.8 97.5L87.2 97.5L88.1 97.4L88.9 97.1L89.7 96.6L90.5 95.9L91 95.1L91.3 94.3L91.5 93.4L91.5 92.6L91.3 91.7L91 90.9L90.5 90.1L89.9 89.5L88.7 88.8L88.1 88.6L87.2 88.5L76 88.5L76 86L75.8 86L75.5 84.6Z",
  },
  "technical-ai-safety": {
    frame: "shield",
    name: "Technical AI Safety Fellowship",
    // network
    glyph:
      "M69 54.1L68.7 52.8L68.3 51.6L67.7 50.4L67 49.3L66 48.3L65 47.5L63.8 46.9L62.6 46.4L61.3 46.1L60 46L58.7 46.1L57.4 46.4L56.2 46.9L55 47.5L54 48.3L53 49.3L52.3 50.4L51.5 52L51.2 53.2L51 55L51.2 56.8L51.5 58L52.1 59.2L52.8 60.4L40.6 80.2L39 80L37.7 80.1L36 80.5L34.8 81.1L33.6 81.8L32.3 83L31.3 84.4L30.7 85.6L30.2 87.2L30 88.6L30 89.9L30.3 91.2L30.7 92.4L31.5 94L32.3 95L33.3 96L34 96.5L35.2 97.1L36.8 97.7L37.7 97.9L39 98L40.3 97.9L41.2 97.7L42.4 97.3L43.2 96.9L44 96.5L45 95.7L45.7 95L46.5 94L46.9 93.2L47.4 92.2L72.6 92.2L73.1 93.2L73.8 94.4L74.6 95.4L75.6 96.2L76.8 96.9L78 97.5L79.2 97.8L80.6 98L81.4 98L82.8 97.8L83.6 97.6L84.8 97.1L86.4 96.2L87.4 95.4L88 94.7L88.7 93.6L89.3 92.4L89.6 91.6L89.9 90.3L90 89L89.9 87.7L89.6 86.4L89.1 85.2L88.5 84L87.7 83L86.4 81.8L85.2 81.1L84 80.5L82.3 80.1L81 80L79.4 80.2L67.2 60.4L67.9 59.2L68.6 57.6L69 55.9ZM58.4 63.8L60 64L61.6 63.8L73.8 83.6L73.1 84.8L72.6 85.8L47.4 85.8L46.9 84.8L46.2 83.6Z",
  },
  "governance-macrostrategy": {
    frame: "tower",
    name: "Governance and Macrostrategy Research Incubator",
    // gavel
    glyph:
      "M53 86.5L31.4 108.1L31 108.8L30.7 109.6L30.6 110.4L30.7 111.2L30.9 112L31.2 112.7L31.7 113.3L32.3 113.9L32.8 114.2L33.6 114.5L34.8 114.7L35.4 114.7L36.2 114.5L36.7 114.2L37.4 113.8L58.8 92.3L61.8 95.3L59.8 97.2L63.7 101.1L78.7 86.2L74.8 82.3L72.8 84.2L61.1 72.5L63.1 70.5L59.2 66.6L44.2 81.6L48.1 85.5L50.1 83.6ZM83.5 121.6L83.5 111.5L55.9 111.5L55.9 121.6Z",
  },
  alignment: {
    frame: "tower",
    name: "Alignment Research Incubator",
    // arrow in the gold
    glyph:
      "M79.8 60.6L79.6 59.8L79.2 59.1L78.6 58.6L77.9 58.2L77.1 58.1L76.3 58.2L75.5 58.6L74.9 59.1L74.5 60L74.3 60.7L74.3 70.8L62.7 82.3L61.3 81.3L59.4 80.2L57.4 79.2L55.2 78.4L53 77.9L50.8 77.6L48.6 77.4L46.3 77.6L44.1 77.9L41.9 78.4L39.8 79.2L37.7 80.2L35.8 81.3L34 82.7L32.3 84.2L30.8 85.8L29.4 87.7L28.3 89.6L27.3 91.6L26.6 93.8L26 96L25.7 98.2L25.6 100.4L25.7 102.7L26 104.9L26.6 107.1L27.3 109.2L28.3 111.3L29.4 113.2L30.8 115L32.3 116.7L34 118.2L35.8 119.6L37.7 120.7L39.8 121.7L41.9 122.4L44.1 123L46.3 123.3L48.6 123.4L50.8 123.3L53 123L55.2 122.4L57.4 121.7L59.4 120.7L61.3 119.6L63.2 118.2L64.8 116.7L66.3 115L67 114.1L68.3 112.3L69.4 110.3L70.2 108.2L70.6 107.1L71.1 104.9L71.4 102.7L71.6 100.4L71.4 98.2L71.1 96L70.6 93.8L70.2 92.7L69.4 90.6L68.8 89.6L67.7 87.7L66.7 86.3L78.2 74.7L88.5 74.7L89.3 74.4L90 74L90.5 73.3L90.8 72.6L90.9 72.1L90.9 71.5L90.7 71L90.5 70.5L90.2 70.1L89.8 69.7L88.9 69.3L88.1 69.2L79.8 69.2ZM51.4 93.7L50 93.2L48.9 93.1L47.5 93.2L46.4 93.4L45.4 93.8L44.2 94.5L43.4 95.2L42.4 96.4L41.9 97.3L41.4 98.7L41.2 100.1L41.2 101.2L41.4 102.2L41.9 103.6L42.4 104.5L43.1 105.4L43.9 106.1L45.1 106.9L46.4 107.5L47.8 107.8L48.9 107.8L50.3 107.6L51.7 107.1L52.9 106.4L54 105.4L54.7 104.5L55.2 103.6L55.7 102.2L55.9 101.2L55.9 99.7L55.7 98.7L55.3 97.6L61.1 91.8L61.9 93.3L62.9 95.3L63.4 97.5L63.7 99L63.7 101.2L63.6 102.7L63.3 104.1L62.6 106.2L61.9 107.6L61.2 108.9L60.3 110.1L59.3 111.2L58.2 112.2L57 113.1L55.7 113.8L54.4 114.5L53 115L51.5 115.3L50 115.5L48.6 115.6L47.1 115.5L45.6 115.3L44.2 115L42.8 114.5L41.4 113.8L40.1 113.1L38.9 112.2L37.8 111.2L36.8 110.1L35.9 108.9L35.2 107.6L34.5 106.2L34 104.8L33.7 103.4L33.5 101.9L33.4 100.4L33.5 99L33.7 97.5L34 96L34.5 94.6L35.2 93.3L36.4 91.4L37.8 89.7L39.5 88.2L41.4 87.1L43.4 86.1L45.6 85.6L47.8 85.3L50 85.3L51.5 85.6L53 85.9L55.1 86.7L57.2 87.9Z",
  },
};

const n = (v: number) => String(Math.round(v * 100) / 100);

/** The crest outline, optionally moved by (dx, dy). Shield 120 x 150.65, tower 110 x 150.65. */
function framePath(frame: Frame, dx = 0, dy = 0): string {
  const x = (v: number) => n(v + dx);
  const y = (v: number) => n(v + dy);
  if (frame === "shield") {
    return `M${x(0)} ${y(15)}L${x(60)} ${y(0)}L${x(120)} ${y(15)}V${y(59)}A100 100 0 0 1 ${x(60)} ${y(H)}A100 100 0 0 1 ${x(0)} ${y(59)}Z`;
  }
  return (
    `M${x(0)} ${y(0)}H${x(24)}V${y(20)}H${x(43)}V${y(0)}H${x(67)}V${y(20)}H${x(86)}V${y(0)}H${x(110)}` +
    `V${y(54)}L${x(103)} ${y(61)}V${y(127)}L${x(110)} ${y(134)}V${y(H)}H${x(0)}V${y(134)}L${x(7)} ${y(127)}V${y(61)}L${x(0)} ${y(54)}Z`
  );
}

export interface ProgrammeCrestProps extends Omit<SVGProps<SVGSVGElement>, "children" | "title"> {
  crest: CrestKey;
  theme?: CrestTheme;
  /** Height in px; the width follows the crest. Under 72 draws the small cut. Keep it at 16 or more. */
  size?: number;
  /** Accessible name. Leave it unset when the programme's name is printed beside the crest. */
  title?: string;
}

export function ProgrammeCrest({ crest, theme = "night", size = 64, title, style, ...rest }: ProgrammeCrestProps) {
  const c = CRESTS[crest];
  const fw = c.frame === "shield" ? 120 : 110;
  const colour = `var(--programme-${crest}, ${CREST_COLOURS[crest]})`;
  const body = framePath(c.frame) + c.glyph;
  const a11y = title ? ({ role: "img", "aria-label": title } as const) : ({ "aria-hidden": true } as const);
  const svgStyle: CSSProperties = { display: "block", flexShrink: 0, ...style };

  if (theme === "white" || theme === "navy") {
    return (
      <svg viewBox={`0 0 ${fw} ${H}`} width={n((size * fw) / H)} height={size} style={svgStyle} {...a11y} {...rest}>
        <path d={body} fillRule="evenodd" style={{ fill: theme === "white" ? WHITE : NAVY }} />
      </svg>
    );
  }

  const small = size < SMALL_BELOW;
  const o = small ? 9 : 6;
  const bodyFill = theme === "solid" ? colour : theme === "paper" ? NAVY : WHITE;
  const offsetFill = theme === "solid" ? WHITE : colour;

  return (
    <svg
      viewBox={`${-o} 0 ${fw + o} ${n(H + o)}`}
      width={n((size * (fw + o)) / (H + o))}
      height={size}
      style={svgStyle}
      {...a11y}
      {...rest}
    >
      {small ? (
        <path d={framePath(c.frame, -o, o) + c.glyph} fillRule="evenodd" style={{ fill: offsetFill }} />
      ) : (
        <path d={body} transform={`translate(${-o} ${o})`} fillRule="evenodd" style={{ fill: offsetFill }} />
      )}
      <path d={body} fillRule="evenodd" style={{ fill: bodyFill }} />
    </svg>
  );
}

/** The programme's full name, for alt text and labels. */
export function crestName(crest: CrestKey): string {
  return CRESTS[crest].name;
}
