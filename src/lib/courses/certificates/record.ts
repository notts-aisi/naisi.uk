import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { faceOf, certificateAddress, certificateUrl, siteHost, type CertificateFaceView } from "./face";
import { linkedInHref } from "./linkedin";
import { CERTIFICATES_COLLECTION, normalizeCertificate, type CertificateDoc } from "./model";
import { NOT_HERE } from "./words";

/**
 * READING A CERTIFICATE BY ITS CODE, and the one thing its owner changes.
 *
 * WHO SEES WHAT (privacy policy v7, "Certificates"):
 *  - ITS OWNER, signed in as themselves, always: the certificate and their
 *    controls, whether its link is on or off;
 *  - ANYBODY ELSE, signed in or not, only while its link is on: the
 *    certificate, with the line that says where to check it;
 *  - otherwise (its link is off, the code is unknown or cannot be one) one
 *    calm answer, the same in every case, so the answer says nothing about
 *    whether a certificate exists.
 *
 * A view-as session is never its owner: the policy says only the owner can
 * open a certificate whose link is off, and an admin borrowing the owner's
 * session is not them. The caller says whether one is live.
 *
 * Every query is one equality on one field, so none needs a declared index.
 */

/**
 * The certificate a code opens, or null. A code is matched exactly once: two
 * certificates sharing one would be a fault, and neither is shown.
 */
export async function findCertificateByCode(db: Firestore, code: string): Promise<CertificateDoc | null> {
  const snap = await db.collection(CERTIFICATES_COLLECTION).where("code", "==", code).limit(2).get();
  if (snap.docs.length !== 1) return null;
  const doc = snap.docs[0];
  return normalizeCertificate(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
}

/** Whether this caller is the certificate's owner, as themselves. */
export function isOwner(cert: CertificateDoc, viewer: SessionUser | null, viewAs: boolean): boolean {
  return !viewAs && viewer !== null && cert.uid !== null && cert.uid === viewer.uid;
}

export type CertificatePageView =
  | {
      state: "owner";
      code: string;
      face: CertificateFaceView;
      linkOn: boolean;
      /** "naisi.uk/c/…", over the certificate. */
      address: string;
      /** The whole address, for Copy link. */
      url: string;
      /** Where Download PDF goes: the owner's own download. */
      pdfHref: string;
      /** LinkedIn's form with the title, the date and the link; null for a certificate with no issue time. */
      linkedInHref: string | null;
    }
  | { state: "public"; code: string; face: CertificateFaceView; address: string }
  | { state: "none" };

/** Where a certificate's PDF is downloaded from, by its owner alone. */
export function certificatePdfHref(code: string): string {
  return `/api/courses/certificates/${code}/pdf`;
}

/**
 * What the page at `/c/<code>` shows this caller. `code` is already in its
 * stored form (`codeFrom`), or null for one that cannot be a code.
 */
export async function certificatePageView(
  db: Firestore,
  code: string | null,
  viewer: SessionUser | null,
  viewAs: boolean,
  appUrl: string | undefined,
): Promise<CertificatePageView> {
  if (!code) return { state: "none" };
  const cert = await findCertificateByCode(db, code);
  if (!cert) return { state: "none" };
  const host = siteHost(appUrl);
  const check = cert.linkOn ? { host, code: cert.code } : null;
  if (isOwner(cert, viewer, viewAs)) {
    const url = certificateUrl(appUrl, cert.code);
    return {
      state: "owner",
      code: cert.code,
      face: faceOf(cert.kind, cert.snapshot, check),
      linkOn: cert.linkOn,
      address: certificateAddress(appUrl, cert.code),
      url,
      pdfHref: certificatePdfHref(cert.code),
      linkedInHref: cert.issuedAt
        ? linkedInHref({ kind: cert.kind, programme: cert.snapshot.programme, issuedAt: cert.issuedAt, url })
        : null,
    };
  }
  if (!cert.linkOn) return { state: "none" };
  return {
    state: "public",
    code: cert.code,
    face: faceOf(cert.kind, cert.snapshot, check),
    address: certificateAddress(appUrl, cert.code),
  };
}

/**
 * What the PDF of a certificate draws, for its OWNER ALONE, or null. Nobody
 * else downloads it, even while its link is on: the policy says the owner
 * can download it, and a downloaded copy is outside our reach, so the owner
 * alone decides when copies exist. A view-as session is never the owner. The
 * PDF is the page's certificate as its owner sees it now: the check line
 * only while the link is on.
 */
export async function certificatePdfFor(
  db: Firestore,
  code: string | null,
  viewer: SessionUser | null,
  viewAs: boolean,
  appUrl: string | undefined,
): Promise<{ code: string; face: CertificateFaceView; issuedAt: Date | null } | null> {
  if (!code || !viewer) return null;
  const cert = await findCertificateByCode(db, code);
  if (!cert || !isOwner(cert, viewer, viewAs)) return null;
  const check = cert.linkOn ? { host: siteHost(appUrl), code: cert.code } : null;
  return { code: cert.code, face: faceOf(cert.kind, cert.snapshot, check), issuedAt: cert.issuedAt };
}

export type SwitchOutcome = { ok: true; linkOn: boolean } | { ok: false; status: 404; error: string };

/**
 * The owner turning the link on or off. Anybody else, and any code that opens
 * nothing, is told the same: there is no certificate here. The owner is asked
 * again inside the write, so a certificate whose account has just gone is not
 * changed.
 */
export async function setCertificateLink(
  db: Firestore,
  viewer: SessionUser,
  code: string,
  linkOn: boolean,
): Promise<SwitchOutcome> {
  const refuse: SwitchOutcome = { ok: false, status: 404, error: NOT_HERE };
  const cert = await findCertificateByCode(db, code);
  if (!cert || !isOwner(cert, viewer, false)) return refuse;
  const ref = db.collection(CERTIFICATES_COLLECTION).doc(cert.id);
  const changed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? normalizeCertificate(snap.id, (snap.data() ?? {}) as Record<string, unknown>) : null;
    if (!current || current.code !== code || !isOwner(current, viewer, false)) return false;
    tx.update(ref, { linkOn, linkChangedAt: FieldValue.serverTimestamp() });
    return true;
  });
  return changed ? { ok: true, linkOn } : refuse;
}
