import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readRunGlossary, readRunStartHere, type GlossaryDoc, type GuideLinks, type StartHereDoc } from "./model";

/**
 * A run's Start here and Glossary, read on the server for a page: one read of
 * the run's document, then the one reader of each (`readRunStartHere`,
 * `readRunGlossary`). Who may see them is the page's own question, asked
 * before this is called; nothing here decides it.
 */
export async function loadRunGuide(db: Firestore, runId: string): Promise<{ startHere: StartHereDoc | null; glossary: GlossaryDoc | null }> {
  const snap = await db.collection("courseRuns").doc(runId).get();
  const data = snap.exists ? snap.data() : null;
  return { startHere: readRunStartHere(data), glossary: readRunGlossary(data) };
}

/**
 * What the week page and the programme page link to: each page only when its
 * document exists, and null when the run has neither, so a page with nothing
 * to link is handed nothing.
 */
export async function guideLinksOf(db: Firestore, runId: string): Promise<GuideLinks | null> {
  const { startHere, glossary } = await loadRunGuide(db, runId);
  if (!startHere && !glossary) return null;
  return { startHere: startHere !== null, glossaryTerms: glossary ? glossary.terms.length : null };
}
