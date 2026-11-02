import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { PangramReading } from "@/lib/ai/pangram";
import { PANGRAM_CHECKS_COLLECTION } from "./collections";
import { fingerprintOf } from "./input";

/**
 * PANGRAM'S READINGS AS THEY ARE KEPT (privacy v13: ADMINS ONLY, everywhere),
 * read without sending anything: `coursePangramChecks/{runId}__{uid}`, each
 * answer's last reading by its row's id, with a hash of the words it read.
 * The check that writes them, and the Coursework tab's views, are
 * `./pangram.ts`; this file only reads, so a page that shows a reading never
 * reaches the code that sends text to Pangram.
 */

export const pangramCheckId = (runId: string, uid: string) => `${runId}__${uid}`;

type Raw = Record<string, unknown>;

/** One answer's last reading, as it is kept. */
export type StoredReading = PangramReading & { hash: string; worthALook: boolean; at: string };

/** Every reading in one person's record, by row id. Never throws. */
export function readingsOf(data: Raw | undefined): Record<string, StoredReading> {
  const parts = data?.parts && typeof data.parts === "object" ? (data.parts as Record<string, Raw>) : {};
  const out: Record<string, StoredReading> = {};
  for (const [rowId, raw] of Object.entries(parts)) {
    if (!raw || typeof raw !== "object" || typeof raw.label !== "string") continue;
    const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
    out[rowId] = {
      label: raw.label,
      headline: typeof raw.headline === "string" ? raw.headline : "",
      fractionAi: number(raw.fractionAi),
      fractionAiAssisted: number(raw.fractionAiAssisted),
      fractionHuman: number(raw.fractionHuman),
      hash: typeof raw.hash === "string" ? raw.hash : "",
      worthALook: raw.worthALook === true,
      at: typeof raw.at === "string" ? raw.at : "",
    };
  }
  return out;
}

/** Pangram's last reading of one answer, as the chip beside it on the review page says it. */
export type AnswerReading = { worthALook: boolean; outOfDate: boolean };

/**
 * Pangram's last reading of one written answer, for the chip beside it on its
 * review page: whether it is worth a look, and whether the answer has changed
 * since (`words` are its words as Pangram is sent them, `writtenAnswerWords`,
 * hashed as the check hashes them). Null when it was never checked. ADMINS
 * ONLY: the review page asks for it for an admin alone. One read by id;
 * writes nothing and sends nothing.
 */
export async function readAnswerReading(
  db: Firestore,
  input: { runId: string; uid: string; rowId: string; words: string },
): Promise<AnswerReading | null> {
  const snap = await db.collection(PANGRAM_CHECKS_COLLECTION).doc(pangramCheckId(input.runId, input.uid)).get();
  const reading = readingsOf(snap.data() as Raw | undefined)[input.rowId] ?? null;
  if (!reading) return null;
  return { worthALook: reading.worthALook, outOfDate: reading.hash !== fingerprintOf(input.words) };
}
