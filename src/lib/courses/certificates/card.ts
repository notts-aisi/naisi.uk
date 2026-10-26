import { issuedShortWords } from "./dates";
import { certificateUrl, faceOf, siteHost, type CertificateFaceView } from "./face";
import { linkedInHref } from "./linkedin";
import type { CertificateDoc, CertificateKind } from "./model";
import { CARD_PRIVATE, CARD_PUBLIC, SEE_FOR_FACILITATING, SEE_FOR_FINISHING, SEE_YOUR_CERTIFICATE, cardIssuedLine } from "./words";

/**
 * ONE CERTIFICATE AS THE PROGRAMME PAGE'S CARD DRAWS IT (board
 * en-after-phone, "Your certificate"), for its owner: the certificate made
 * smaller, the day it was issued, whether anyone else can see it, and the
 * way to its page and to LinkedIn. Only what the card shows travels, never
 * the stored document.
 *
 * Pure: the run home's page reads the owner's certificates and hands this in.
 */
export type CertificateCardView = {
  kind: CertificateKind;
  face: CertificateFaceView;
  /** "Issued Mon 14 Dec" (capitals by its stylesheet), or null with no issue time. */
  issued: string | null;
  /** "Only you can see it until you turn its link on." or, while it is on, "Anyone with the link can see it." */
  privacy: string;
  /** The certificate's own page. */
  href: string;
  /** "See your certificate"; for somebody holding both, which one it is. */
  see: string;
  linkedInHref: string | null;
};

export function cardViewOf(cert: CertificateDoc, holdsBoth: boolean, appUrl: string | undefined): CertificateCardView {
  const url = certificateUrl(appUrl, cert.code);
  return {
    kind: cert.kind,
    face: faceOf(cert.kind, cert.snapshot, cert.linkOn ? { host: siteHost(appUrl), code: cert.code } : null),
    issued: cert.issuedAt ? cardIssuedLine(issuedShortWords(cert.issuedAt)) : null,
    privacy: cert.linkOn ? CARD_PUBLIC : CARD_PRIVATE,
    href: `/c/${cert.code}`,
    see: holdsBoth ? (cert.kind === "finished" ? SEE_FOR_FINISHING : SEE_FOR_FACILITATING) : SEE_YOUR_CERTIFICATE,
    linkedInHref: cert.issuedAt
      ? linkedInHref({ kind: cert.kind, programme: cert.snapshot.programme, issuedAt: cert.issuedAt, url })
      : null,
  };
}
