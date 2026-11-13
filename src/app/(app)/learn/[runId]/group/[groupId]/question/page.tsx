import { redirect } from "next/navigation";
import QuestionView from "@/features/courses/coursework/QuestionView";
import { NoWeekToRead } from "@/features/courses/coursework/ReadingView";
import { getRunAccess, getSessionUser } from "@/features/courses/runAccess";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { isAddressableId } from "@/lib/addressableId";
import { readFirstOfKind, readQuestionFilter } from "@/lib/courses/coursework/question";
import { loadGroupQuestion } from "@/lib/courses/coursework/questionLoad";
import { ONE_QUESTION_TITLE } from "@/lib/courses/coursework/words";
import { liveGroupsOf, reviewerFactsOf } from "@/lib/courses/writtenAnswers/access";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";

/**
 * ONE QUESTION, THE WHOLE GROUP (Fri 13 Nov 2026), from the group's side:
 * `/learn/[runId]/group/[groupId]/question?week=N&question=ID`, beside the
 * reading view of one person's week (`./coursework/[uid]`) and reached from
 * it ("One question, whole group"). With no week named it opens the newest
 * week anybody in the group has written in, else the newest that has begun
 * for the group; with no question named, the week's first of the kind
 * `first=` asks for (`answer`, `reflection`) when it asks one, else the
 * week's first. `unread=1`, `nofeedback=1` and `late=1` keep only those
 * answers, together or apart.
 *
 * It is where the group's written answers for a week and its reflections with
 * names now forward to (`src/lib/courses/coursework/forwards.ts`), and the
 * page where lines are picked to read out leads here ("Read them with
 * names"); on a reflection, a reader that page admits is led back to it.
 *
 * THE GATE is the reading view's on this side, as it is: the run's layout has
 * decided the caller holds some role on the run; this page admits the group's
 * live facilitators, the lead of the programme that names the run and admins,
 * and the group must belong to this run. Everybody else is sent to the run's
 * home: redirects, never 403s, so guessing ids says nothing. Whose answers it
 * lists is the one gate on whose work a reader may act on, person by person
 * (`loadGroupQuestion` asks `readableInGroup`): a facilitator never sees a
 * co-facilitator's own answer or anybody's rating, and nobody their own.
 *
 * Nothing here writes. Once in the browser, the page names the answers it
 * drew so the time each was first read is kept, through its own route.
 */

export const dynamic = "force-dynamic";

type Query = {
  week?: string | string[];
  question?: string | string[];
  first?: string | string[];
  unread?: string | string[];
  nofeedback?: string | string[];
  late?: string | string[];
};

export default async function GroupQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string; groupId: string }>;
  searchParams?: Promise<Query>;
}) {
  const { runId, groupId } = await params;
  const query = await (searchParams ?? Promise.resolve({} as Query));

  const access = await getRunAccess(runId);
  if (!access) {
    const user = await getSessionUser();
    redirect(user ? "/learn" : "/login");
  }
  const runHome = `/learn/${encodeURIComponent(runId)}`;
  if (!isAddressableId(groupId)) redirect(runHome);

  const db = getAdminDb();
  if (!db) redirect(runHome);

  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  if (!groupSnap.exists) redirect(runHome);
  const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
  if (group.runId !== runId) redirect(runHome);

  const [liveGroups, facts] = await Promise.all([liveGroupsOf(db, runId), reviewerFactsOf(db, access.user, runId)]);
  const facilitatesThisGroup =
    !group.archived && isNamedWithStanding(access.user, "courseGroups.facilitatorUids", group.facilitatorUids);
  if (!facilitatesThisGroup && !facts.isAdmin && !facts.isLead) redirect(runHome);

  const programme = await runProgrammeOf(db, runId).catch(() => null);
  const groupPath = `${runHome}/group/${encodeURIComponent(groupId)}`;
  const groupLabel = group.name.trim() || "Your group";
  // The group's page admits its live facilitators and admins; the lead, who has no page for the group here, goes back to the run's home.
  const programmeName = programme?.shortName || access.run.courseTitle;
  const back = facilitatesThisGroup || facts.isAdmin ? { label: groupLabel, href: groupPath } : { label: programmeName, href: runHome };
  const view = await loadGroupQuestion(db, access.user, {
    door: "group",
    run: access.run,
    group,
    liveGroups,
    facts,
    viewer: facts.isAdmin ? "admin" : facilitatesThisGroup ? "facilitator" : "lead",
    askedWeek: query.week ?? null,
    askedQuestion: query.question ?? null,
    askedFirst: readFirstOfKind(query.first),
    filter: readQuestionFilter(query),
    programmeName,
    base: `${groupPath}/question`,
    personBase: `${groupPath}/coursework`,
    back,
    crumb: back,
    leadFirstName: programme?.leadFirstName ?? null,
    // The page where lines are picked to read out admits the group's live facilitators and admins, never the lead.
    readOutHref: facilitatesThisGroup || facts.isAdmin ? (weekNumber) => `${groupPath}/reflections?week=${weekNumber}` : null,
    // A facilitator's page is the one group's own: nothing to choose between here.
    groupChoice: null,
  });
  // A run with none of its weeks written as blocks: nothing to read one question at a time, said calmly.
  if (!view) return <NoWeekToRead name={ONE_QUESTION_TITLE} eyebrow={[programmeName, groupLabel].join(" · ")} marks={[]} crumb={back} />;
  return <QuestionView view={view} />;
}
