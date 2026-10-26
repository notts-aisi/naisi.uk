import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { cardViewOf, type CertificateCardView } from "./card";
import { CERTIFICATE_KINDS, CERTIFICATES_COLLECTION, certificateId, normalizeCertificate, type CertificateDoc } from "./model";

/**
 * A PERSON'S OWN CERTIFICATES ON ONE RUN, for the card on the programme's
 * page (board en-after-phone): read by their two addresses, never a query,
 * and only those still theirs (`uid`) and still the run's. Nothing for
 * anybody sent none: somebody who did not finish sees nothing about
 * certificates. A view-as session is never the owner, so its caller passes
 * `viewAs` and is answered nothing.
 */
export async function readOwnCertificates(
  db: Firestore,
  runId: string,
  uid: string,
  viewAs: boolean,
  appUrl: string | undefined,
): Promise<CertificateCardView[]> {
  if (viewAs || !runId || !uid || runId.includes("/") || uid.includes("/")) return [];
  const snaps = await db.getAll(
    ...CERTIFICATE_KINDS.map((kind) => db.collection(CERTIFICATES_COLLECTION).doc(certificateId(runId, uid, kind))),
  );
  const own: CertificateDoc[] = [];
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const cert = normalizeCertificate(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
    if (cert && cert.uid === uid && cert.runId === runId) own.push(cert);
  }
  return own.map((cert) => cardViewOf(cert, own.length === 2, appUrl));
}
