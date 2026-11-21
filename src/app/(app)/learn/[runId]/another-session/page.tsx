import { redirect } from "next/navigation";
import OwnRequests from "@/features/courses/excused/OwnRequests";
import styles from "@/features/courses/leaving/Leaving.module.css";
import { ProgrammeBar } from "@/features/courses/leaving/Parts";
import { getRunAccess } from "@/features/courses/runAccess";
import AnotherSessionForm from "@/features/courses/visitRequest/AnotherSessionForm";
import { VisitRequestWaiting } from "@/features/courses/visitRequest/CardParts";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { nextSessionAnswersFor } from "@/lib/courses/nextSession/answers";
import { anotherSessionPageFor } from "@/lib/courses/visitRequest/own";
import { ANOTHER_SESSION_TITLE, ASK_REFUSAL } from "@/lib/courses/visitRequest/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";

/**
 * "ANOTHER SESSION THIS WEEK": the person's own form for asking to go to
 * another group's session in the week of their next session, at a stable
 * address the card's "Go to another session this week" leads to.
 *
 * WHO. Somebody taking part (the programme page's own gate, `isEnrolled`);
 * anybody else goes back to the run's home, which decides the rest. A
 * redirect, not a refusal, the learning space's rule: a guessed address says
 * nothing.
 *
 * WHAT. When something can be asked now (`anotherSessionPageFor`): "You stay
 * in Group C. An admin approves it. ...", the week's sessions with the places
 * left in each and the full ones shown and not choosable, "Anything to add
 * (optional)" with the line about medical details, "Send the request" and
 * "One request at a time. ...". When nothing can be asked, the page says so
 * for itself in one sentence, and a request still waiting is shown with its
 * Withdraw. Under it, "Your requests": one list with their requests to be
 * excused. In a view-as session everything is drawn and nothing can be
 * pressed (the routes refuse it too).
 */

export const dynamic = "force-dynamic";

export default async function AnotherSessionPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const home = `/learn/${encodeURIComponent(runId)}`;
  const access = await getRunAccess(runId);
  if (!access) redirect("/learn");
  if (!access.isEnrolled) redirect(home);
  const db = getAdminDb();
  if (!db) redirect(home);

  const now = new Date();
  const asked = { user: access.user, run: access.run, enrolment: access.enrolment, groups: access.groups, now };
  const [view, answers, programme, marker] = await Promise.all([
    anotherSessionPageFor(db, asked).catch(() => null),
    // Their requests to be excused, for the one list under the form: the card's own answers.
    nextSessionAnswersFor(db, { ...asked, takesPart: access.isEnrolled }),
    runProgrammeOf(db, access.run.id).catch(() => null),
    getImpersonator(),
  ]);
  const locked = markerIsLive(marker, access.user.uid);
  const name = programme?.shortName || access.run.courseTitle.trim() || "this programme";
  const waiting = view?.card.waiting ?? null;
  const excused = answers.excused;
  const excusedRows = excused?.asks ? excused.requests : [];
  const visitRows = view?.card.rows ?? [];

  return (
    <div className={styles.page}>
      <ProgrammeBar backHref={home} backLabel={name} title={ANOTHER_SESSION_TITLE} />
      <div className={styles.body}>
        <section className={styles.section}>
          <h1 className={styles.pageTitle}>{ANOTHER_SESSION_TITLE}</h1>
          {view?.form ? (
            <AnotherSessionForm runId={access.run.id} form={view.form} locked={locked} />
          ) : waiting ? (
            <VisitRequestWaiting waiting={waiting} locked={locked} />
          ) : (
            <p className={`${styles.text} ${styles.lede}`} data-testid="another-session-nothing">
              {ASK_REFUSAL.nothingToAsk}
            </p>
          )}
        </section>
        {(excusedRows.length > 0 || visitRows.length > 0) && <OwnRequests requests={excusedRows} visitRequests={visitRows} />}
      </div>
    </div>
  );
}
