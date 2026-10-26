import type { CSSProperties } from "react";
import { EMBLEM_BOX, EMBLEM_CASTLE, EMBLEM_SHIELD, EMBLEM_WAVE } from "@/lib/courses/certificates/emblem";
import type { CertificateFaceView } from "@/lib/courses/certificates/face";
import {
  CERTIFICATE_INKS as INK,
  CERTIFICATE_SIZES as SIZE,
  EMBLEM_INKS,
  MONO_TRACKING,
} from "@/lib/courses/certificates/look";
import { LOCKUP_LINES } from "@/lib/courses/certificates/pdfLayout";

/**
 * A CERTIFICATE, AS A DRAWING (boards en-cert and en-cert-phone): the lockup,
 * the short rule, the eyebrow over a finished certificate, the name, what
 * they did, the programme, the meta line, the issue sentence and, while its
 * link is on, where to check it. Every word comes in on `face`
 * (`faceOf`), never from a stored document.
 *
 * Drawn on the certificate's own page, in the Overview's preview and in the
 * programme page's card, and the PDF draws the same certificate from the same
 * inks and sizes (`look.ts`) and the same emblem (`emblem.ts`, the Night
 * master's own outlines, drawn here as `BrandMark` draws the full cut). It
 * carries its look with it, in the style of each element, rather than in a
 * stylesheet: it is one drawing wherever it is put, whatever the page around
 * it, and no host's stylesheet can restyle it.
 *
 * It sizes itself to the width it is given (a container of its own): at 760
 * pixels it is the laptop board's certificate, and the name, the programme
 * and the space around them shrink towards the phone board's as it narrows.
 * A thumbnail is the full drawing made smaller (CSS `zoom` on a box around
 * it), as the boards draw one.
 *
 * No state and no handlers, so a Server Component can render it.
 */
export default function CertificateFace({
  face,
  nameAs = "p",
}: {
  face: CertificateFaceView;
  /** The name is the page's heading on the certificate's own page, and a line anywhere else. */
  nameAs?: "h1" | "p";
}) {
  const Name = nameAs;
  return (
    <div role="group" aria-label={face.label} style={ROOT}>
      <div aria-hidden="true" style={FRAME} />
      <div style={BODY}>
        <Lockup />
        <div style={RULE_AND_EYEBROW}>
          <span aria-hidden="true" style={RULE} />
          {face.eyebrow && <div style={EYEBROW}>{face.eyebrow}</div>}
        </div>
        <Name style={NAME}>{face.name}</Name>
        <p style={DID}>{face.did}</p>
        <p style={PROGRAMME}>
          <span style={PROGRAMME_INK}>{face.programme}</span>
        </p>
        <div style={META}>{face.meta}</div>
        <div aria-hidden="true" style={DIVIDER} />
        <p style={ISSUED}>{face.issued}</p>
        {face.check && <div style={CHECK}>{face.check}</div>}
      </div>
    </div>
  );
}

/** The emblem and the full name beside it, as the boards' lockup draws them. */
function Lockup() {
  const width = Math.round(((SIZE.emblem * EMBLEM_BOX.w) / EMBLEM_BOX.h) * 100) / 100;
  const outline = (
    <>
      <path d={EMBLEM_CASTLE} fillRule="evenodd" />
      <path d={EMBLEM_SHIELD} />
      <path d={EMBLEM_WAVE} />
    </>
  );
  return (
    <div style={LOCKUP}>
      <svg
        width={width}
        height={SIZE.emblem}
        viewBox={`${EMBLEM_BOX.x} ${EMBLEM_BOX.y} ${EMBLEM_BOX.w} ${EMBLEM_BOX.h}`}
        aria-hidden="true"
        focusable="false"
        style={EMBLEM}
      >
        <g fill={EMBLEM_INKS.echo} transform={`translate(${-EMBLEM_BOX.shift} ${EMBLEM_BOX.shift})`}>
          {outline}
        </g>
        <g fill={EMBLEM_INKS.face}>{outline}</g>
      </svg>
      <span style={LOCKUP_NAME}>
        {LOCKUP_LINES[0]}
        <br />
        {LOCKUP_LINES[1]}
        <br />
        {LOCKUP_LINES[2]}
      </span>
    </div>
  );
}

const DISPLAY = "var(--font-display)";
const META_FACE = "var(--font-meta)";
const px = (n: number) => `${n}px`;
const stops = (inks: readonly string[], at: readonly number[]) =>
  inks.map((ink, i) => `${ink} ${Math.round(at[i] * 100)}%`).join(", ");

const ROOT: CSSProperties = {
  position: "relative",
  // Its own container, so the sizes below follow the certificate's width.
  containerType: "inline-size",
  width: "100%",
  maxWidth: px(SIZE.width),
  margin: "0 auto",
  boxSizing: "border-box",
  borderRadius: px(SIZE.radius),
  border: `1px solid ${INK.edge}`,
  background: `radial-gradient(ellipse 75% 60% at 50% 0%, ${stops(INK.ground, INK.groundStops)})`,
  boxShadow: "0 24px 64px rgba(0, 0, 0, 0.45)",
  overflow: "hidden",
  color: INK.text,
};

const LOCKUP: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: px(SIZE.lockupGap),
  textAlign: "left",
};

const EMBLEM: CSSProperties = {
  display: "block",
  flex: "none",
  // The cyan copy sits just outside the box the emblem is measured by.
  overflow: "visible",
  maxWidth: "none",
};

const LOCKUP_NAME: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: px(SIZE.lockupName),
  lineHeight: 1.04,
  letterSpacing: "-0.01em",
  color: INK.text,
};

const FRAME: CSSProperties = {
  position: "absolute",
  inset: px(SIZE.frameInset),
  border: `1px solid ${INK.frame}`,
  borderRadius: px(SIZE.frameRadius),
  pointerEvents: "none",
};

// Between the phone board's 350 pixels and the laptop board's 760.
const BODY: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  padding: `clamp(40px, 8cqi, ${px(SIZE.padding.top)}) clamp(24px, 8.4cqi, ${px(SIZE.padding.side)}) clamp(32px, 6.3cqi, ${px(SIZE.padding.bottom)})`,
};

const RULE_AND_EYEBROW: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: px(SIZE.eyebrowGap),
  marginTop: px(SIZE.ruleGap),
};

const RULE: CSSProperties = {
  display: "block",
  width: px(SIZE.rule.width),
  height: px(SIZE.rule.height),
  borderRadius: px(SIZE.rule.height),
  background: INK.cyan,
  opacity: 0.85,
};

const MONO: CSSProperties = {
  fontFamily: META_FACE,
  textTransform: "uppercase",
  overflowWrap: "anywhere",
};

const EYEBROW: CSSProperties = {
  ...MONO,
  fontSize: px(SIZE.eyebrow),
  letterSpacing: `${MONO_TRACKING.eyebrow}em`,
  color: INK.cyan,
  lineHeight: 1.4,
};

const NAME: CSSProperties = {
  margin: `${px(SIZE.nameGap)} 0 0`,
  fontFamily: DISPLAY,
  fontWeight: 600,
  fontSize: `clamp(34px, 3.41cqi + 22px, ${px(SIZE.name)})`,
  lineHeight: 1.08,
  letterSpacing: "-0.025em",
  color: INK.text,
  textWrap: "balance",
  overflowWrap: "anywhere",
};

const DID: CSSProperties = {
  margin: `${px(SIZE.didGap)} 0 0`,
  fontSize: px(SIZE.did),
  lineHeight: 1.4,
  color: INK.muted,
};

const PROGRAMME: CSSProperties = {
  margin: `${px(SIZE.programmeGap)} 0 0`,
  fontFamily: DISPLAY,
  fontWeight: 600,
  fontSize: `clamp(24px, 1.95cqi + 17px, ${px(SIZE.programme)})`,
  lineHeight: 1.15,
  letterSpacing: "-0.02em",
  textWrap: "balance",
  overflowWrap: "anywhere",
};

const PROGRAMME_INK: CSSProperties = {
  // The cyan stands in wherever the gradient cannot be drawn into the letters.
  color: INK.cyan,
  background: `linear-gradient(120deg, ${stops(INK.programme, INK.programmeStops)})`,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const META: CSSProperties = {
  ...MONO,
  marginTop: px(SIZE.metaGap),
  fontSize: px(SIZE.meta),
  letterSpacing: `${MONO_TRACKING.meta}em`,
  color: INK.soft,
  lineHeight: 1.5,
  textWrap: "balance",
};

const DIVIDER: CSSProperties = {
  width: `min(100%, ${px(SIZE.dividerWidth)})`,
  height: "1px",
  margin: `${px(SIZE.dividerGap)} auto 0`,
  background: `linear-gradient(90deg, transparent, ${INK.edge} 20%, ${INK.edge} 80%, transparent)`,
};

const ISSUED: CSSProperties = {
  margin: `${px(SIZE.issuedGap)} auto 0`,
  maxWidth: `${SIZE.issuedMeasure}em`,
  fontSize: px(SIZE.issued),
  lineHeight: 1.55,
  color: INK.soft,
  textWrap: "balance",
};

const CHECK: CSSProperties = {
  ...MONO,
  marginTop: px(SIZE.checkGap),
  fontSize: px(SIZE.check),
  letterSpacing: `${MONO_TRACKING.check}em`,
  color: INK.muted,
  lineHeight: 1.5,
};
