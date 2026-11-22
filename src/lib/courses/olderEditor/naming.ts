import "server-only";
import { cache } from "react";
import { isAddressableId } from "@/lib/addressableId";
import { readNamingProgramme, type NamingProgramme } from "@/lib/courses/programmeLead";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * The programme that names a run, read once per request however many of the
 * older editor's server parts ask (the run's layout, for the line at the top,
 * and the run and week pages below it). Null when none does, when the id is
 * not one, and when the read fails: every caller then shows what it shows
 * for a run no programme names.
 */
export const namingProgrammeOf = cache(async (runId: string): Promise<NamingProgramme | null> => {
  const db = getAdminDb();
  if (!db || !isAddressableId(runId)) return null;
  return readNamingProgramme(db, runId).catch(() => null);
});
