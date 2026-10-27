import type { CertificateKind, CertificateSnapshot } from "./model";
import { addressWords, certificateLabel, checkLine, eyebrowLine, issuedSentence, metaLine } from "./words";

/**
 * WHAT A DRAWING OF A CERTIFICATE SAYS, line by line: the page at `/c/<code>`,
 * the thumbnails on the Overview and the programme page, the preview the lead
 * opens, and the PDF all draw this one view, so none can say a word another
 * does not.
 *
 * Only what the drawing shows travels: the words, never the stored document.
 * Pure, so a client component can be handed one.
 */
export type CertificateFaceView = {
  kind: CertificateKind;
  /** "Certificate for Amara Okafor", for a screen reader. */
  label: string;
  /** "Certificate · Autumn 2026" over a finished certificate's name; null on a facilitator's. */
  eyebrow: string | null;
  name: string;
  /** "finished the" or "facilitated a group on the". */
  did: string;
  programme: string;
  /** "6 weeks · based on the BlueDot Impact curriculum", or "Autumn 2026 · 6 weeks · based on the BlueDot Impact curriculum". */
  meta: string;
  /** "Issued on Mon 14 Dec 2026 by NAISI, …". */
  issued: string;
  /** "Check it at naisi.uk/c/…" while the link is on; null while it is off, and on a preview. */
  check: string | null;
};

/** A certificate's drawing, from its kind and snapshot. `check` is the code and host while the link is on. */
export function faceOf(
  kind: CertificateKind,
  snapshot: CertificateSnapshot,
  check: { host: string; code: string } | null,
): CertificateFaceView {
  return {
    kind,
    label: certificateLabel(snapshot.name),
    eyebrow: kind === "finished" ? eyebrowLine(snapshot) : null,
    name: snapshot.name,
    did: snapshot.did,
    programme: snapshot.programme,
    meta: metaLine(kind, snapshot),
    issued: issuedSentence(snapshot.issuedOn),
    check: check ? checkLine(check.host, check.code) : null,
  };
}

/**
 * The host a certificate's address is given in ("naisi.uk"), from the site's
 * own address, so a copy of the site names itself. The live site's when none
 * is set.
 */
export function siteHost(appUrl: string | undefined): string {
  try {
    return new URL(appUrl || "https://naisi.uk").host || "naisi.uk";
  } catch {
    return "naisi.uk";
  }
}

/** The site's own origin ("https://naisi.uk"), for an address a person is sent or copies. */
export function siteOrigin(appUrl: string | undefined): string {
  try {
    return new URL(appUrl || "https://naisi.uk").origin;
  } catch {
    return "https://naisi.uk";
  }
}

/** The page's whole address: "https://naisi.uk/c/K7Q2…". */
export function certificateUrl(appUrl: string | undefined, code: string): string {
  return `${siteOrigin(appUrl)}/c/${code}`;
}

/** "naisi.uk/c/K7Q2…", over the certificate on its page. */
export function certificateAddress(appUrl: string | undefined, code: string): string {
  return addressWords(siteHost(appUrl), code);
}
