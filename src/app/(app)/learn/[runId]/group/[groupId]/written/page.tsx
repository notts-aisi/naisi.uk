import { redirect } from "next/navigation";
import { groupWrittenForward } from "@/lib/courses/coursework/forwards";

/**
 * A GROUP'S WRITTEN ANSWERS, RETIRED (Fri 13 Nov 2026):
 * `/learn/[runId]/group/[groupId]/written?week=&person=` now forwards, worked
 * out from the address alone, to the page that replaced it: one person's
 * answer to the reading view of their week at the written answer
 * (`./coursework/[uid]?week=N#reading-answer`), the group's answers for a week
 * to the page of one question across the group at the week's written answer
 * (`./question?week=N&first=answer`). An address already sent, in an email or
 * on Home, keeps working. See `src/lib/courses/coursework/forwards.ts`.
 *
 * It reads nothing and asks nobody anything: the page it forwards to answers
 * with its own gate, as it does for anybody who typed its address, so it tells
 * nobody whether a run, a group or a person exists.
 */

export const dynamic = "force-dynamic";

type Query = { week?: string | string[]; person?: string | string[] };

export default async function GroupWrittenForward({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string; groupId: string }>;
  searchParams?: Promise<Query>;
}) {
  const [{ runId, groupId }, query] = await Promise.all([params, searchParams ?? Promise.resolve({} as Query)]);
  redirect(groupWrittenForward(`/learn/${encodeURIComponent(runId)}/group/${encodeURIComponent(groupId)}`, query));
}
