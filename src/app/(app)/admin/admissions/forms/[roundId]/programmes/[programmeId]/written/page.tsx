import { redirect } from "next/navigation";
import { programmeWrittenForward } from "@/lib/courses/coursework/forwards";

/**
 * THE WRITTEN ANSWER'S REVIEW PAGE ON THE PROGRAMME'S SIDE, RETIRED (Fri 13
 * Nov 2026): `.../programmes/[programmeId]/written?group=&week=&person=` now
 * forwards, worked out from the address alone, to the page that replaced it:
 * a person's answer to the reading view of their week at the written answer
 * (`./coursework/[uid]?week=N#reading-answer`), a group's answers for a week
 * to the page of one question across the group at the week's written answer
 * (`./question?group=G&week=N&first=answer`). See
 * `src/lib/courses/coursework/forwards.ts`.
 *
 * It reads nothing and asks nobody anything: the page it forwards to answers
 * with its own gate, as it does for anybody who typed its address, so an
 * address already sent keeps working and tells nobody whether anything
 * exists.
 */

export const dynamic = "force-dynamic";

type Query = { group?: string | string[]; week?: string | string[]; person?: string | string[] };

export default async function ProgrammeWrittenForward({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams?: Promise<Query>;
}) {
  const [{ roundId, programmeId }, query] = await Promise.all([params, searchParams ?? Promise.resolve({} as Query)]);
  redirect(programmeWrittenForward(`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}`, query));
}
