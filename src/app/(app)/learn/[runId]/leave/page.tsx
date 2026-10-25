import { redirect } from "next/navigation";
import LeaveForm from "@/features/courses/leaving/LeaveForm";
import styles from "@/features/courses/leaving/Leaving.module.css";
import { ProgrammeBar } from "@/features/courses/leaving/Parts";
import { getRunAccess } from "@/features/courses/runAccess";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { leavePathFor } from "@/lib/courses/leaving";
import { LEAVE_LINK, UNTITLED_COURSE, leaveHeading, leaveLines, reasonReaders } from "@/lib/courses/leavingWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { ENROLMENT_LIMITS } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";

/**
 * LEAVING THE PROGRAMME: the confirmation "Leave the programme" on the
 * programme page leads to. What leaving does, in three sentences; an optional
 * reason, with who reads it; the course's title typed to confirm; and the
 * press, which is the enrol route's leave (`DELETE .../enrol`).
 *
 * WHO. Somebody taking part, whose seat can be left by themselves
 * (`leavePathFor`: an open run, or a place the term's application form gave
 * them), until the run's last session is over. Anybody else, everybody who
 * has left already, and everybody once the run has ended, goes back to the
 * run's home, which decides the rest. A redirect, not a refusal, the learning
 * space's rule: a guessed address says nothing.
 *
 * Drawn on the server; the form is a client component that takes the fields
 * it shows and nothing else.
 */

export const dynamic = "force-dynamic";

export default async function LeavePage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const home = `/learn/${encodeURIComponent(runId)}`;

  const access = await getRunAccess(runId);
  if (!access) redirect("/learn");
  const enrolment = access.enrolment;
  if (!access.isEnrolled || !enrolment || enrolment.role !== "learner" || enrolment.status !== "active") {
    redirect(home);
  }
  const db = getAdminDb();
  if (!db) redirect(home);

  const answer = await leavePathFor(db, access.run, access.user.uid, new Date());
  if (!("path" in answer)) redirect(home);
  const { path } = answer;

  const [programme, groupSnap] = await Promise.all([
    runProgrammeOf(db, access.run.id).catch(() => null),
    enrolment.groupId && !enrolment.groupId.includes("/")
      ? db.collection("courseGroups").doc(enrolment.groupId).get()
      : Promise.resolve(null),
  ]);
  const group =
    groupSnap && groupSnap.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
  const groupName = group && group.runId === access.run.id ? group.name.trim() || null : null;
  const name = programme?.shortName || access.run.courseTitle.trim() || "this programme";

  return (
    <div className={styles.page}>
      <ProgrammeBar backHref={home} backLabel={name} title={LEAVE_LINK} />
      <div className={styles.body}>
        <section className={styles.section}>
          <h1 className={styles.pageTitle}>{leaveHeading(name)}</h1>
          {leaveLines(groupName).map((line) => (
            <p key={line} className={`${styles.text} ${styles.lede}`}>
              {line}
            </p>
          ))}
        </section>
        {access.run.courseTitle.length === 0 ? (
          // Nothing to type, so nothing to confirm with: the route's own
          // sentence, and no form whose button could never work.
          <p className={styles.text}>{UNTITLED_COURSE}</p>
        ) : (
          <LeaveForm
            runId={access.run.id}
            courseTitle={access.run.courseTitle}
            name={name}
            readers={reasonReaders({ kind: path.kind, leadFirstName: programme?.leadFirstName ?? null, name })}
            reasonMax={ENROLMENT_LIMITS.dropOutReason}
          />
        )}
      </div>
    </div>
  );
}
