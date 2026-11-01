import Link from "next/link";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import MessagesNotYours from "@/features/courses/updates/MessagesNotYours";
import UpdateComposer from "@/features/courses/updates/UpdateComposer";
import { StaffUpdatesSection } from "@/features/courses/updates/UpdatesList";
import styles from "@/features/courses/updates/Messages.module.css";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { updateAudienceCounts } from "@/lib/courses/updates/audience";
import { loadRunGroups, loadUpdatesFor, updateReadingOf } from "@/lib/courses/updates/readers";
import { composerAudiences, staffUpdateRows } from "@/lib/courses/updates/views";
import { getAdminDb } from "@/lib/firebase/admin";
import { tagId } from "@/lib/audience/tags";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";
import { compareGroupsByMeeting } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { postTargetsOf } from "@/lib/messages/posting";
import { OPEN_IN_MESSAGES, messagesHrefFor } from "@/lib/messages/words";
import { messageWriterOf } from "@/lib/messages/writers";

/**
 * One programme's Messages tab (wk-messages, option B): "New update", and
 * below it every update on the run the programme names, newest first, each
 * with who it was to and what its email did.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from
 * the form before the run is read; a reviewer is told the tab is the lead's
 * and an admin's. The updates are read through the one reader
 * (`updateReadingOf`), which answers "every update" for exactly those two on
 * the run their programme names. The press is the updates route, which asks
 * again who the caller is on the run.
 *
 * The board's "Next week's email" table belongs to the scheduled email's own
 * piece of work and is not drawn here.
 *
 * ABOVE IT, "Write in Messages": Messages set to this programme's people,
 * where a message can be posted here as well. Drawn only when the programme
 * is one of this term's and Messages would start with it for the person
 * reading (`postTargetsOf`), so the link never opens an empty composer.
 */
export default async function ProgrammeMessagesPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <MessagesNotYours roundId={roundId} programmeId={programmeId} />;
  const { view } = outcome;
  if (!view.run) return <RunBlank view={view} />;

  const runSnap = await db.collection("courseRuns").doc(view.run.id).get();
  if (!runSnap.exists) return <RunBlank view={{ ...view, blank: "run-gone" }} />;
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  // To offers the groups in the order every tab of this page lists them.
  const groups = (await loadRunGroups(db, run.id)).sort(compareGroupsByMeeting);
  const programmeName = view.programmeName.trim() || run.courseTitle.trim() || "this programme";
  const reading = await updateReadingOf(db, user, run, groups);
  const [counts, loaded, writer] = await Promise.all([
    updateAudienceCounts(db, run, groups, null, user.uid),
    loadUpdatesFor(db, run, reading, groups, programmeName),
    messageWriterOf(db, user, new Date()),
  ]);
  const everyone = tagId({ kind: "programme", roundId, programmeId, part: "everyone" });
  const opensMessages = writer !== null && postTargetsOf(writer).some((target) => target.tagId === everyone);

  return (
    <div className={styles.stack}>
      {opensMessages && (
        <div className={styles.write}>
          <Link href={messagesHrefFor(everyone)} className={styles.writeLink}>
            {OPEN_IN_MESSAGES.link}
          </Link>
          <p className={styles.writeLine}>{OPEN_IN_MESSAGES.line}</p>
        </div>
      )}
      <UpdateComposer runId={run.id} audiences={composerAudiences(counts, programmeName)} />
      <StaffUpdatesSection updates={staffUpdateRows(loaded.updates)} headingId="programme-updates" />
    </div>
  );
}
