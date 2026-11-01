import GroupNotesCard from "@/features/courses/facilitator/GroupNotesCard";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import { GroupWeeksCard } from "@/features/courses/facilitatorWeek/ThisWeeksWork";
import GroupSharedNotes from "@/features/courses/weekly/GroupSharedNotes";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import NotYours from "@/features/applications/groups/NotYours";
import ProgrammeAttendance from "@/features/applications/groups/ProgrammeAttendance";
import RunBlank from "@/features/applications/groups/RunBlank";
import { LeadWrittenAnswersCard } from "@/features/courses/written/ReviewQueueCard";
import { loadWrittenQueues } from "@/lib/courses/writtenAnswers/queue";
import { compareGroupsByMeeting } from "@/lib/firestore/courseGroups";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { leadNotesHeading, notesWhoLine } from "@/lib/courses/facilitatorPageWords";
import { readRunGroupNotes } from "@/lib/courses/groupNotes/readers";
import { runHasBlockWeeks, weekOfGroup } from "@/lib/courses/facilitatorWeek/readers";
import { sharedNotesForAttendance } from "@/lib/courses/sharedNotes/readers";
import { buildRunAttendance, readRunRecords } from "@/lib/courses/programmeAttendance";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's Attendance tab (board wk-attendance): every register of the
 * course run the programme names, as one grid, read only.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from
 * the form before the run is read. A reviewer is told the tab is the lead's
 * and an admin's. The grid is worked out on the server, once
 * (`buildRunAttendance`), from the run's records: who is a row follows the
 * register's own rule, so a lead sees the people Publish has told, and an
 * admin everybody placed. Nothing here marks anything.
 *
 * `?group=<id>` opens the tab on one group: the Overview's "See it" links
 * here that way. An id that is not one of the run's groups is ignored.
 *
 * THE NOTES EACH GROUP'S FACILITATORS SHARE (C30) are read here too, under
 * the grid, a card per group that has any: the programme's lead and admins
 * read them and write none. They are read on the server after the tab's own
 * gate, and the cards are handed only what they show. The register's own
 * notes, on a person or a session, are not among them: those are the
 * group's facilitators' and admins' alone.
 *
 * THE NOTES EACH GROUP SHARES ON ITS WEEK PAGES (C29) are read here too, under
 * the facilitators' notes, a card per group that has any. The programme's
 * lead and admins read them and write none; `sharedNotesForAttendance` asks
 * who the reader is before it reads, and the cards are handed only what they
 * show.
 *
 * EACH GROUP'S WEEK, on a run whose weeks are written as blocks: a line per
 * group, the week it is getting ready for, and the way to the lead's view of
 * it (`../../week`), where the lead and admins read This week's work, who
 * ticked each source and the group's reflections, a facilitator's own among
 * them, marked as theirs. Worked out from the run's own calendar; nothing
 * about anybody is read for it.
 */
export default async function ProgrammeAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams?: Promise<{ group?: string | string[] }>;
}) {
  const [{ roundId, programmeId }, query, user] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { group?: string | string[] }),
    requireAdmissionsPage(),
  ]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") {
    return <NotYours roundId={roundId} programmeId={programmeId} tab="Attendance" />;
  }
  const { view } = outcome;
  if (!view.run) return <RunBlank view={view} />;
  const records = await readRunRecords(db, view.run.id);
  if (!records) return <RunBlank view={{ ...view, blank: "run-gone" }} />;
  const model = buildRunAttendance(records, { isAdmin: view.viewer === "admin" }, new Date());
  const asked = typeof query.group === "string" ? query.group : "all";
  const [notes, programme] = await Promise.all([readRunGroupNotes(db, view.run.id), runProgrammeOf(db, view.run.id)]);
  // Who reads the notes, as the line under each card says it: "you" to the
  // lead, the lead by first name to an admin.
  const lead =
    view.viewer === "lead"
      ? { firstName: "", isReader: true }
      : programme?.leadFirstName
        ? { firstName: programme.leadFirstName, isReader: false }
        : null;
  const noted = model.groups.filter((group) => (notes.get(group.id) ?? []).length > 0);
  const shared = await sharedNotesForAttendance(db, user, records.run, records.groups, programme?.leadFirstName ?? null);
  // Feedback to write: the written answers waiting for the lead's (or an
  // admin's) feedback, a line per group, a facilitator's own answer among
  // them: null on a run of the summer's weeks, which has none.
  const liveGroups = records.groups.filter((group) => !group.archived);
  const writtenQueues = await loadWrittenQueues(db, user, records.run, liveGroups);
  const writtenPath = `/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/written`;
  // Each group's week, on a run whose weeks are written as blocks.
  const now = new Date();
  const groupWeeks =
    records.groups.length > 0 && (await runHasBlockWeeks(db, records.run.id))
      ? records.groups.map((group) => ({
          id: group.id,
          name: group.name,
          weekNumber: weekOfGroup(records.run, group, now)?.weekNumber ?? null,
          // A page of this site written out from ids, never from stored text.
          href: `/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/week?group=${encodeURIComponent(group.id)}`,
        }))
      : null;
  return (
    <>
      <ProgrammeAttendance
        model={model}
        roundId={view.roundId}
        programmeId={view.programmeId}
        programmeName={view.programmeName}
        initialGroup={model.groups.some((group) => group.id === asked) ? asked : "all"}
      />
      {writtenQueues && liveGroups.length > 0 && (
        <div className={facilitator.leadNotes}>
          <LeadWrittenAnswersCard
            groups={[...liveGroups]
              .sort(compareGroupsByMeeting)
              .map((group) => ({
                id: group.id,
                name: group.name.trim() || "Untitled group",
                weeks: (writtenQueues.get(group.id) ?? []).map((row) => row.weekNumber),
                href: `${writtenPath}?group=${encodeURIComponent(group.id)}`,
              }))}
          />
        </div>
      )}
      {groupWeeks && (
        <div className={facilitator.leadNotes}>
          <GroupWeeksCard groups={groupWeeks} />
        </div>
      )}
      {noted.length > 0 && (
        <div className={facilitator.leadNotes}>
          {noted.map((group) => (
            <GroupNotesCard
              key={group.id}
              title={leadNotesHeading(group.name)}
              whoLine={notesWhoLine(group.name, lead)}
              notes={notes.get(group.id) ?? []}
              writeFor={null}
              headingId={`notes-${group.id}`}
            />
          ))}
        </div>
      )}
      {shared.length > 0 && (
        <div className={facilitator.leadNotes}>
          {shared.map((section) => (
            <GroupSharedNotes key={section.groupId} section={section} weekNumber={null} />
          ))}
        </div>
      )}
    </>
  );
}
