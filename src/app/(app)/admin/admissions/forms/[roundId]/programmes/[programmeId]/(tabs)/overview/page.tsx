import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import { BeforeTheRun } from "@/features/applications/overview/OverviewFrontCards";
import ProgrammeOverview from "@/features/applications/overview/ProgrammeOverview";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { own } from "@/lib/applications/keys";
import { APPLICATIONS_TO_READ_TITLE, applicationsToReadOn } from "@/lib/applications/programmes/overview";
import { loadCertificatesSection } from "@/lib/courses/certificates/send";
import { loadFeedbackBatch } from "@/lib/courses/feedback/send";
import { loadWhoFinished } from "@/lib/courses/finishing/whoFinished";
import { buildGetReady } from "@/lib/courses/getReady/model";
import { readGetReady } from "@/lib/courses/getReady/read";
import { readRunRecords } from "@/lib/courses/programmeAttendance";
import { anyGroupHasMet, buildProgrammeOverview } from "@/lib/courses/programmeOverview";
import { OPEN_REQUESTS, OVERVIEW_REQUESTS_TITLE, overviewRequestsWords } from "@/lib/courses/registerCorrection/pageWords";
import { requestsWaitingOnRunOnce } from "@/lib/courses/requests/home";
import { requestsForRunPath } from "@/lib/courses/requests/paths";
import { loadRunGroups, loadUpdatesFor, updateReadingOf } from "@/lib/courses/updates/readers";
import { overviewUpdateRows } from "@/lib/courses/updates/views";
import { getAdminDb } from "@/lib/firebase/admin";
import { leadAfterSurveyCard } from "@/lib/surveys/leadTab";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's Overview tab, the first tab of a
 * programme that names a course run: the week the run is in, each group's
 * session this week and its register, what needs attention, who came by
 * week, and how many are taking part.
 *
 * ATTENDANCE BY WEEK AND THE GROUPS IN A WEEK: a row a week of the run, from
 * its finished registers, and one row per group for the week in the address
 * (`?week=3`, chosen with the page's own week picker, a plain GET form) or
 * the week the programme is in (`buildProgrammeOverview`, through
 * `src/lib/courses/overviewByWeek.ts`). Each row opens the group's page on
 * that week; each week opens the Attendance tab.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from
 * the form before the run is read, as Groups and Attendance are. A reviewer
 * is told the tab is the lead's and an admin's. Every figure is worked out on
 * the server from the run's records, the way the Attendance tab works them
 * out, and the page only draws them. The one thing it does is "Remind",
 * which goes through its own route. Its Updates card shows the newest
 * updates on the run, read as the Messages tab reads them, and links there.
 *
 * Once the run's last session is over, Who finished leads
 * the page, and its switches save through their own route; before then the
 * People card says when it can be done (`loadWhoFinished`). Certificates
 * follows it, read only then (`loadCertificatesSection`, which asks the
 * same question of the form again), and sends through its own two routes.
 * Then "The after survey" (finding A5): how many have answered the
 * survey at the end, the Surveys tab's own count for it
 * (`leadAfterSurveyCard`), with the way to the tab. "Certificates go out
 * [date]" is not drawn: no record holds that day.
 *
 * FEEDBACK TO SEND (`loadFeedbackBatch`), once anybody has saved feedback on
 * the run: every piece whose "you have feedback" email has not gone, the
 * email each person gets, and, for an admin, the test and the send, through
 * their own two routes. The lead reads the list and is told an admin sends it.
 *
 * BEFORE ANY OF THE RUN'S GROUPS HAS MET (`anyGroupHasMet`) the page is "Get
 * ready for week 1" instead: the
 * checklist, who has not said when they are free, the places and the
 * facilitators, read once (`readGetReady`) and worked out by `buildGetReady`,
 * the same facts Publish's own page checks itself against.
 *
 * APPLICATIONS TO READ comes first while the programme's form takes or
 * decides applications (`applicationsToReadOn`): the reader's own count and
 * the way to them, and for an admin who neither leads nor reviews it no count
 * that is not theirs. With no run yet, it comes first and "no run yet" under
 * it. It reads the form's decisions for a reader whose count it is; the
 * applications are the head's own read, shared.
 *
 * REQUESTS follows Needs attention while requests about the programme's
 * people wait: the head's own count (`requestsWaitingOnRunOnce`, one read for
 * the head and this card), so for the lead only the register corrections a
 * lead decides, never a kind that is an admin's alone; and for an admin
 * requests to be excused, to go to another session and to change group too.
 * Messages to the team and access needs belong to no programme and are in no
 * programme's count. "Open requests" opens the Requests page narrowed to this
 * programme's run, whose rows are the ones counted here.
 */
export default async function ProgrammeOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams?: Promise<{ week?: string | string[] }>;
}) {
  const [{ roundId, programmeId }, query, user] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { week?: string | string[] }),
    requireAdmissionsPage(),
  ]);
  // The week the groups are shown for: chosen on the page, read only as a whole week number.
  const asked = Array.isArray(query.week) ? query.week[0] : query.week;
  const chosenWeek = typeof asked === "string" && /^\d{1,2}$/.test(asked) ? Number(asked) : null;
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  const programmePath = `/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}`;
  if (outcome.status === "not-yours") {
    return (
      <Refusal
        title="Only the programme’s lead and admins can open Overview"
        href={`${programmePath}/applications`}
        action="Go to applications"
      >
        Overview shows how the programme’s groups and registers are going, by name, so only the programme’s lead or
        an admin can open it.
      </Refusal>
    );
  }
  const { view, form } = outcome;
  const now = new Date();
  // While the form takes or decides applications: the reader's own count, first.
  const toReadOf = (reading: Awaited<ReturnType<typeof applicationsToReadOn>>) =>
    reading ? { title: APPLICATIONS_TO_READ_TITLE, ...reading } : null;
  const reading = applicationsToReadOn(db, user, form, view.programmeId, now);
  if (!view.run) {
    return (
      <BeforeTheRun toRead={toReadOf(await reading)}>
        <RunBlank view={view} />
      </BeforeTheRun>
    );
  }
  const [read, records] = await Promise.all([reading, readRunRecords(db, view.run.id)]);
  const toRead = toReadOf(read);
  if (!records) {
    return (
      <BeforeTheRun toRead={toRead}>
        <RunBlank view={{ ...view, blank: "run-gone" }} />
      </BeforeTheRun>
    );
  }
  // Requests about this programme's people, as the head counts them for this reader.
  const [groups, waiting] = await Promise.all([
    loadRunGroups(db, records.run.id),
    requestsWaitingOnRunOnce(db, user, records.run.id, { excused: view.viewer === "admin" }),
  ]);
  const programmeName = view.programmeName.trim() || own(form.programmes, view.programmeId)?.name.trim() || "";
  const requests =
    waiting > 0
      ? {
          title: OVERVIEW_REQUESTS_TITLE,
          count: waiting,
          line: overviewRequestsWords(waiting, programmeName, view.viewer),
          action: { label: OPEN_REQUESTS, href: requestsForRunPath(records.run.id) },
        }
      : null;
  // The role decides the name each person is shown by (`nameForViewer`).
  const viewer = { isAdmin: view.viewer === "admin", uid: user.uid, role: user.role };
  // Before any group has met: "Get ready for week 1".
  const beforeTheStart = !anyGroupHasMet(records, now);
  const [model, loaded, finishing, ready, feedbackToSend] = await Promise.all([
    buildProgrammeOverview(
      db,
      records,
      viewer,
      {
        programmePath,
        courseId: view.run.courseId,
        decisionsSentAt: form.decisionsSentAt,
        incubator: own(form.programmes, view.programmeId)?.kind === "incubator",
      },
      now,
      chosenWeek,
    ),
    updateReadingOf(db, user, records.run, groups).then((reading) =>
      loadUpdatesFor(db, records.run, reading, groups, view.programmeName),
    ),
    loadWhoFinished(db, records, viewer, now),
    beforeTheStart ? readGetReady(db, user, view.roundId, view.programmeId, records, now) : Promise.resolve(null),
    beforeTheStart ? Promise.resolve(null) : loadFeedbackBatch(db, user, records.run.id, viewer.isAdmin ? "admin" : "lead", now),
  ]);
  const [certificates, afterSurvey] =
    finishing.state === "open"
      ? await Promise.all([
          loadCertificatesSection(db, user, roundId, programmeId, now),
          leadAfterSurveyCard(db, { roundId, programmeId }, now),
        ])
      : [null, null];
  return (
    <ProgrammeOverview
      model={model}
      updates={overviewUpdateRows(loaded.updates)}
      roundId={view.roundId}
      programmeId={view.programmeId}
      programmePath={programmePath}
      finishing={finishing}
      certificates={certificates}
      afterSurvey={afterSurvey}
      feedbackToSend={feedbackToSend?.show ? { model: feedbackToSend, runId: records.run.id } : null}
      getReady={ready ? { model: buildGetReady(ready.facts), courseId: ready.courseId, runId: records.run.id } : null}
      toRead={toRead}
      requests={requests}
    />
  );
}
