/**
 * HOW A CERTIFICATE LOOKS (boards en-cert and en-cert-phone), written once
 * for both of its drawings: the one on a page (`CertificateFace.tsx`, on the
 * certificate's own page, the Overview's preview and the programme page's
 * card) and the PDF (`pdf.ts`). Neither can drift from the other.
 *
 * THE INKS ARE THE CERTIFICATE'S OWN. A certificate is one drawing in the
 * Night look wherever it appears, so these do not change with the site's
 * theme, as the network motif's navies and the emblem's two colours do not
 * (`NetField.module.css`, `BrandMark.module.css`). Where one has the value of
 * a theme token today, it is named beside it.
 *
 * THE SIZES ARE THE BOARD'S, for a certificate 760 pixels wide (the laptop
 * board). The page lets the name, the programme and the space around them
 * shrink towards the phone board's at its narrowest; the PDF scales the
 * whole drawing to its page.
 *
 * Pure: values only.
 */

export const CERTIFICATE_INKS = {
  /** The navy ground, a radial wash from the top centre: its four stops, centre first. */
  ground: ["#1d2858", "#121a44", "#0b1024", "#080c18"],
  /** Where each stop sits, as a share of the wash. */
  groundStops: [0, 0.38, 0.72, 1],
  /** The outer edge (`--color-border-strong`). */
  edge: "#3a4868",
  /** The inner frame, 8px inside the edge (`--color-border`). */
  frame: "#2a344d",
  /** The name (`--color-text`). */
  text: "#e6eaf2",
  /** The meta line and the issue sentence (`--color-text-soft`). */
  soft: "#c3cad9",
  /** "finished the" and the check line (`--color-text-muted`). */
  muted: "#8b94ac",
  /** The short rule and the eyebrow (`--color-live`). */
  cyan: "#22d3ee",
  /** The programme's name, a gradient across it, left to right. */
  programme: ["#4d8eff", "#22d3ee", "#5cf3ff"],
  /** Where each of the programme's stops sits. */
  programmeStops: [0, 0.7, 1],
} as const;

/** The emblem's own two inks, as `BrandMark.module.css` holds them. */
export const EMBLEM_INKS = { face: "#ffffff", echo: "#00d4ff" } as const;

/** The board's laptop certificate, in pixels. */
export const CERTIFICATE_SIZES = {
  width: 760,
  radius: 18,
  /** The inner frame's inset and corner. */
  frameInset: 8,
  frameRadius: 11,
  padding: { top: 60, side: 64, bottom: 48 },
  /** The emblem's height in the lockup, and the name beside it. */
  emblem: 72,
  lockupName: 17,
  lockupGap: 14,
  /** From the lockup to the short rule. */
  ruleGap: 36,
  rule: { width: 40, height: 2 },
  /** From the rule to the eyebrow. */
  eyebrowGap: 18,
  eyebrow: 13,
  nameGap: 22,
  name: 48,
  didGap: 12,
  did: 18,
  programmeGap: 8,
  programme: 32,
  metaGap: 16,
  meta: 13,
  /** The rule under the meta line, and the space above it. */
  dividerGap: 28,
  dividerWidth: 360,
  issuedGap: 22,
  issued: 15,
  /** The issue sentence's measure, in its own ems. */
  issuedMeasure: 30,
  checkGap: 18,
  check: 12,
} as const;

/** Letter spacing of the three lines set in the mono face, in ems. */
export const MONO_TRACKING = { eyebrow: 0.16, meta: 0.12, check: 0.1 } as const;
