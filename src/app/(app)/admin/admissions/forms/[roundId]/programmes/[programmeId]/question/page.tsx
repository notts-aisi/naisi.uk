import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import shared from "@/features/applications/editor/editor.module.css";
import NotYours from "@/features/applications/groups/NotYours";
import RunBlank from "@/features/applications/groups/RunBlank";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import QuestionView from "@/features/courses/coursework/QuestionView";
import { NoWeekToRead } from "@/features/courses/coursework/ReadingView";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { readFirstOfKind, readQuestionFilter } from "@/lib/courses/coursework/question";
import { loadGroupQuestion } from "@/lib/courses/coursework/questionLoad";
import { BACK_TO_COURSEWORK, ONE_QUESTION_TITLE } from "@/lib/courses/coursework/words";
import { openLeadDoor } from "@/lib/courses/facilitatorWeek/leadDoor";
import { noGroupsWords } from "@/lib/courses/facilitatorWeek/words";
import { reviewerFactsOf } from "@/lib/courses/writtenAnswers/access";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * ONE QUESTION, THE WHOLE GROUP (Fri 13 Nov 2026), from the programme's side:
 * `.../programmes/[programmeId]/question?group=G&week=N&question=ID`, beside
 * the reading view of one person's week (`./coursework/[uid]`) and reached
 * from it ("One question, whole group"), as the programme's other pages about
 * one group (`written`, `reflections`, `week`) are addressed. With no group
 * named, the first in the order every tab lists them; no week named, the
 * newest week anybody in the group has written in, else the newest that has
 * begun for it; no question named, the week's first of the kind `first=`
 * asks for (`answer`, `reflection`) when it asks one, else the week's first.
 * `unread=1`, `nofeedback=1` and `late=1` keep only those answers, together
 * or apart.
 *
 * It is where the written answer's review page for a group's week and the
 * programme's reflections with names now forward to
 * (`src/lib/courses/coursework/forwards.ts`).
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`openLeadDoor`), decided from the
 * form before the run is read, any live group of the programme's run; a
 * reviewer is told it is the lead's and an admin's. Whose answers it lists is
 * the one gate on whose work a reader may act on, person by person
 * (`loadGroupQuestion`): the group's fellows and its facilitators' own work,
 * and never the reader's own. Ratings for the team are the reader's here, as
 * in the reading view of a person's week.
 *
 * THIS PAGE STANDS ALONE, outside the `(tabs)` route group, as one person's
 * week does, with its own way back to the Coursework tab. Nothing here
 * writes. Once in the browser, the page names the answers it drew so the time
 * each was first read is kept, through its own route.
 */

export const dynamic = "force-dynamic";

type Query = {
  group?: string | string[];
  week?: string | string[];
  question?: string | string[];
  first?: string | string[];
  unread?: string | string[];
  nofeedback?: string | string[];
  late?: string | string[];
};

export default async function ProgrammeQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams?: Promise<Query>;
}) {
  const [{ roundId, programmeId }, query, user] = await Promise.all([params, searchParams ?? Promise.resolve({} as Query), requireAdmissionsPage()]);
  const db = getAdminDb();
  const door = db ? await openLeadDoor(db, user, roundId, programmeId, query.group) : null;
  if (!db || !door || door.kind === "none") return <NoProgrammeHere roundId={roundId} />;
  if (door.kind === "not-yours") return <NotYours roundId={roundId} programmeId={programmeId} tab="Coursework" />;
  if (door.kind === "blank") {
    return (
      <ApplicationsRoot className={shared.page}>
        <RunBlank view={door.view} />
      </ApplicationsRoot>
    );
  }

  // Every address here is a page of this site written out from ids, never from stored text.
  const programmePath = `/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}`;
  const tab = { label: BACK_TO_COURSEWORK, href: `${programmePath}/coursework` };
  if (door.kind === "no-groups") {
    return (
      <Refusal title={ONE_QUESTION_TITLE} href={tab.href} action={`Go to ${BACK_TO_COURSEWORK}`}>
        {noGroupsWords(door.view.programmeName)}
      </Refusal>
    );
  }

  const { run, groups, group, viewer } = door;
  const [facts, programme] = await Promise.all([reviewerFactsOf(db, user, run.id), runProgrammeOf(db, run.id)]);
  const programmeName = programme?.shortName || door.view.programmeName;
  const view = await loadGroupQuestion(db, user, {
    door: "programme",
    run,
    group,
    liveGroups: groups,
    facts,
    viewer,
    askedWeek: query.week ?? null,
    askedQuestion: query.question ?? null,
    askedFirst: readFirstOfKind(query.first),
    filter: readQuestionFilter(query),
    programmeName,
    base: `${programmePath}/question?group=${encodeURIComponent(group.id)}`,
    personBase: `${programmePath}/coursework`,
    back: { label: group.name, href: `${programmePath}/groups/${encodeURIComponent(group.id)}` },
    crumb: tab,
    leadFirstName: programme?.leadFirstName ?? null,
    // The page where lines are picked to read out is the group's facilitators' and admins', under /learn: not offered here.
    readOutHref: null,
    // The lead chooses the group here too: every live group of the run, which this door admits them to.
    groupChoice: {
      groups: groups.map((each) => ({ id: each.id, name: each.name })),
      base: (groupId) => `${programmePath}/question?group=${encodeURIComponent(groupId)}`,
    },
  });
  return (
    <ApplicationsRoot className={shared.page}>
      {view ? (
        <QuestionView view={view} />
      ) : (
        // A run with none of its weeks written as blocks: nothing to read one question at a time, said calmly.
        <NoWeekToRead name={ONE_QUESTION_TITLE} eyebrow={[programmeName, group.name].join(" · ")} marks={[]} crumb={tab} />
      )}
    </ApplicationsRoot>
  );
}
