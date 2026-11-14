import { redirect } from "next/navigation";
import { groupNamedReflectionsForward } from "@/lib/courses/coursework/forwards";

/**
 * A GROUP'S REFLECTIONS READ WITH NAMES, RETIRED (Fri 13 Nov 2026):
 * `/learn/[runId]/group/[groupId]/reflections/names?week=` now forwards,
 * worked out from the address alone, to the page of one question across the
 * group at the week's first reflection (`../question?week=N&first=reflection`),
 * which lists each person the reader may read with their answer under their
 * name and "Nothing written yet" for anybody who has not written one. The page
 * where lines are picked to read out stays as it is, without names, and its
 * "Read them with names" leads there. See
 * `src/lib/courses/coursework/forwards.ts`.
 *
 * It reads nothing and asks nobody anything: the page it forwards to answers
 * with its own gate, as it does for anybody who typed its address.
 */

export const dynamic = "force-dynamic";

type Query = { week?: string | string[] };

export default async function GroupNamedReflectionsForward({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string; groupId: string }>;
  searchParams?: Promise<Query>;
}) {
  const [{ runId, groupId }, query] = await Promise.all([params, searchParams ?? Promise.resolve({} as Query)]);
  redirect(groupNamedReflectionsForward(`/learn/${encodeURIComponent(runId)}/group/${encodeURIComponent(groupId)}`, query));
}
