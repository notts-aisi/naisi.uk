import { redirect } from "next/navigation";
import { programmeReflectionsForward } from "@/lib/courses/coursework/forwards";

/**
 * A GROUP'S REFLECTIONS WITH NAMES ON THE PROGRAMME'S SIDE, RETIRED (Fri 13
 * Nov 2026): `.../programmes/[programmeId]/reflections?group=&week=` now
 * forwards, worked out from the address alone, to the page of one question
 * across the group at the week's first reflection
 * (`./question?group=G&week=N&first=reflection`), which lists each person of
 * the group with their answer under their name, a facilitator's own marked as
 * theirs, and "Nothing written yet" for anybody who has not written one. See
 * `src/lib/courses/coursework/forwards.ts`.
 *
 * It reads nothing and asks nobody anything: the page it forwards to answers
 * with its own gate (`openLeadDoor`), as it does for anybody who typed its
 * address.
 */

export const dynamic = "force-dynamic";

type Query = { group?: string | string[]; week?: string | string[] };

export default async function ProgrammeReflectionsForward({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams?: Promise<Query>;
}) {
  const [{ roundId, programmeId }, query] = await Promise.all([params, searchParams ?? Promise.resolve({} as Query)]);
  redirect(programmeReflectionsForward(`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}`, query));
}
