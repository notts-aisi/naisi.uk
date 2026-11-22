import { redirect } from "next/navigation";
import OwnRequests from "@/features/courses/excused/OwnRequests";
import styles from "@/features/courses/leaving/Leaving.module.css";
import { ProgrammeBar } from "@/features/courses/leaving/Parts";
import ChangeGroupForm from "@/features/courses/moveRequest/ChangeGroupForm";
import { MoveRequestWaiting } from "@/features/courses/moveRequest/CardParts";
import { getRunAccess } from "@/features/courses/runAccess";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { changeGroupPageFor } from "@/lib/courses/moveRequest/own";
import { CHANGE_GROUP_FOR_GOOD, MOVE_ASK_REFUSAL } from "@/lib/courses/moveRequest/words";
import { nextSessionAnswersFor } from "@/lib/courses/nextSession/answers";
import { ASK_REFUSAL } from "@/lib/courses/visitRequest/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";

/**
 * "CHANGE GROUP FOR GOOD": the person's own form for asking to move to
 * another group for the rest of the programme, at a stable address the
 * programme page's "Change group for good" and the foot of the one-week form
 * lead to.
 *
 * WHO. Somebody taking part (the programme page's own gate, `isEnrolled`);
 * anybody else goes back to the run's home, which decides the rest. A
 * redirect, not a refusal, the learning space's rule: a guessed address says
 * nothing.
 *
 * WHAT. When a request can be sent now (`changeGroupPageFor`): "From the next
 * week whose session hasn't happened. An admin decides. ...", "Groups with a
 * place" (under each, "Why:" when the times they gave on the application form
 * say something true, never in a view-as session), "Why (needed)" with the
 * line about medical details, and "Send the
 * request"; with no group with a place, "No other group has a place right
 * now." When one of theirs waits, of this kind or to go to another session,
 * the page says so ("You already have a request waiting. ..."), with the
 * move request's own Withdraw when it is one; with nothing to ask at all, one
 * sentence. Under it, "Your requests": one list with their requests to be
 * excused and to go to another session. In a view-as session everything is
 * drawn and nothing can be pressed (the routes refuse it too).
 */

export const dynamic = "force-dynamic";

export default async function ChangeGroupPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const home = `/learn/${encodeURIComponent(runId)}`;
  const access = await getRunAccess(runId);
  if (!access) redirect("/learn");
  if (!access.isEnrolled) redirect(home);
  const db = getAdminDb();
  if (!db) redirect(home);

  const now = new Date();
  const asked = { user: access.user, run: access.run, enrolment: access.enrolment, groups: access.groups, now };
  // Decided before anything is read: in a view-as session the "Why:" lines,
  // read from the person's own application, are neither read nor drawn.
  const locked = markerIsLive(await getImpersonator(), access.user.uid);
  const [view, answers, programme] = await Promise.all([
    // A read that fails is told apart from nothing to ask, and draws neither the form nor that sentence.
    changeGroupPageFor(db, { ...asked, viewingAs: locked }).catch(() => "failed" as const),
    // Their requests to be excused and to go to another session, for the one list under the form.
    nextSessionAnswersFor(db, { ...asked, takesPart: access.isEnrolled }),
    runProgrammeOf(db, access.run.id).catch(() => null),
  ]);
  const name = programme?.shortName || access.run.courseTitle.trim() || "this programme";
  const failed = view === "failed";
  const page = failed ? null : view;
  const waiting = page?.card.waiting ?? null;
  // Another request of theirs waits (one at a time, across kinds): said, not offered.
  const otherWaits = page !== null && page.form === null && waiting === null && answers.anotherSession?.waiting != null;
  const excused = answers.excused;
  const excusedRows = excused?.asks ? excused.requests : [];
  const visitRows = answers.anotherSession?.rows ?? [];
  const moveRows = page?.card.rows ?? [];

  return (
    <div className={styles.page}>
      <ProgrammeBar backHref={home} backLabel={name} title={CHANGE_GROUP_FOR_GOOD} />
      <div className={styles.body}>
        <section className={styles.section}>
          <h1 className={styles.pageTitle}>{CHANGE_GROUP_FOR_GOOD}</h1>
          {failed ? null : page?.form ? (
            <ChangeGroupForm runId={access.run.id} form={page.form} locked={locked} />
          ) : waiting ? (
            <MoveRequestWaiting waiting={waiting} locked={locked} />
          ) : (
            <p className={`${styles.text} ${styles.lede}`}>{otherWaits ? ASK_REFUSAL.alreadyWaiting : MOVE_ASK_REFUSAL.nothingToAsk}</p>
          )}
        </section>
        {(excusedRows.length > 0 || visitRows.length > 0 || moveRows.length > 0) && (
          <OwnRequests requests={excusedRows} visitRequests={visitRows} moveRequests={moveRows} />
        )}
      </div>
    </div>
  );
}
