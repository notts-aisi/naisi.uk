import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";
import {
  ROUNDS_COLLECTION,
  STAGES_SUBCOLLECTION,
} from "@/lib/admissions/roundRoutes";
import {
  serialiseApplicationForOwner,
  serialiseRoundForApplicant,
  serialiseStageForApplicant,
  type ApplicantApplication,
  type ApplicantRound,
  type ApplicantStage,
} from "@/lib/admissions/applyRoutes";
import {
  normalizeAdmissionRound,
  normalizeAdmissionStage,
} from "@/lib/firestore/admissionRounds";
import {
  admissionApplicationId,
  admissionApplicationPrivateId,
  normalizeAdmissionApplication,
} from "@/lib/firestore/admissionApplications";
import { normalizeAdmissionApplicationPrivate } from "@/lib/firestore/admissionApplicationPrivate";
import { applyCopy } from "@/lib/admissions/applyCopy";
import { formatRoundDate, formatRoundDeadline } from "@/lib/admissions/window";
import ApplyFlow from "@/features/admissions/ApplyFlow";
import { renderApplicationForm } from "@/features/applications/apply/ApplyScreen";
import { loadFormTitle } from "@/lib/applications/applicant/store";
import { isApplicationForm } from "@/lib/applications/normalise";
import styles from "./apply.module.css";

/**
 * `/apply/[roundId]` - and note WHERE it lives.
 *
 * In `(public)`, not `(app)`, for the same reason the course apply page is:
 * applying is open to any signed-in account INCLUDING role `pending`, and
 * `(app)/layout.tsx` redirects a pending account to `/pending-approval`.
 * Putting this page behind that layout would lock out exactly the people it
 * exists for, the ones who made an account at the fair on Monday.
 *
 * It is also NOT in `src/proxy.ts`'s protected prefixes, deliberately: a
 * signed-out visitor gets the sign-in gate card below, with the return address
 * in the link, rather than a redirect to `/login` from which the round is
 * invisible. Discovery matters here; the routes behind the form do the real
 * enforcement.
 *
 * ## One address, two kinds of round
 *
 * A round that is an APPLICATION FORM (one form a term, for every programme)
 * is shown by the form's own screen, `renderApplicationForm`, which the page
 * offers first. That answers null for everything it does not show: a round of
 * the older kind, a round that is not there, and a form that is still a draft
 * or has been archived. The rest of this page is the older apply flow, and its
 * loader stops at a form, so the older flow is never drawn for one. See
 * `src/lib/admissions/formFence.ts`.
 *
 * ## Everything is loaded here, on the server
 *
 * `admissionRounds`, its `stages` subcollection and `admissionApplications`
 * are all `allow read, write: if false`, so there is no client-direct read to
 * fall back on. Rather than have the island fetch on mount and flash a
 * spinner at somebody standing in a queue, the page reads all three through
 * the Admin SDK and hands the island its opening state. The same serialisers
 * the API routes use are called here, so the two cannot disagree about what an
 * applicant may see, and the release filter is applied in exactly one place.
 *
 * ## The one thing a view-as session does not get to see
 *
 * Admin "view as" is a full impersonation: the session cookie is the target's,
 * so this page renders the member's own application, which is the whole point
 * of the tool. The exception is the access-requirements answer. It lives in
 * `admissionApplicationPrivate` because it will in practice carry disability
 * and health information, and the privacy policy promises that the people who
 * can open it are the final decider and site admins, through a route that
 * records the read. An admin who is standing in a member's session is neither
 * of those, so the join is skipped while a view-as session is live and the
 * field renders empty. `GET .../apply` refuses outright for the same reason.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ roundId: string }> };

type Loaded = {
  round: ApplicantRound;
  stages: ApplicantStage[];
  application: ApplicantApplication | null;
  /** The unserialised deadline, for the page's own chrome. */
  closesAt: Date | null;
  opensAt: Date | null;
};

/**
 * The round, its stages and (when signed in) the caller's own row.
 *
 * Returns null for a round that does not exist, is still a draft, or has been
 * archived. All three answer the same way: which of them it is says something
 * about NAISI's plans that a visitor has no business reading off a page.
 *
 * Returns null for a round that is an APPLICATION FORM as well, asked AFTER
 * those three. A form is not filled in through the flow below: that flow
 * saves and submits through the older apply routes, every one of which
 * refuses a form, and the form has a screen of its own, which the page offers
 * before it calls this. So the loader stops at the round document, before it
 * reads stages or anybody's application in the older shape, and to this half
 * of the page a form is a round that is not there.
 *
 * `joinPrivate` is the view-as switch. Impersonation swaps the session cookie
 * for the TARGET's, so `uid` here is the member's during a view-as session and
 * the private join would put their access-requirements answer, in practice
 * disability and health information, on an admin's screen with nothing
 * recording the read. During a live view-as the join is skipped and the field
 * renders as the empty string, which is the same thing the page shows an
 * applicant who never answered it.
 */
async function loadRound(
  roundId: string,
  uid: string | null,
  joinPrivate: boolean,
): Promise<Loaded | null> {
  const db = getAdminDb();
  if (!db) return null;

  const roundRef = db.collection(ROUNDS_COLLECTION).doc(roundId);
  const roundSnap = await roundRef.get();
  if (!roundSnap.exists) return null;
  const round = normalizeAdmissionRound(roundSnap.id, roundSnap.data() ?? {});
  if (round.archived || round.status === "draft") return null;
  if (isApplicationForm(roundSnap.data())) return null;

  const now = new Date();
  const stagesSnap = await roundRef.collection(STAGES_SUBCOLLECTION).get();
  const stages = stagesSnap.docs
    .map((doc) => normalizeAdmissionStage(doc.id, doc.data() ?? {}))
    .sort((a, b) => a.order - b.order)
    .map((stage) => serialiseStageForApplicant(stage, round, now));

  let application: ApplicantApplication | null = null;
  if (uid) {
    const [appSnap, privateSnap] = await Promise.all([
      db.collection("admissionApplications").doc(admissionApplicationId(roundId, uid)).get(),
      joinPrivate
        ? db
            .collection("admissionApplicationPrivate")
            .doc(admissionApplicationPrivateId(roundId, uid))
            .get()
        : null,
    ]);
    if (appSnap.exists) {
      application = serialiseApplicationForOwner(
        normalizeAdmissionApplication(
          appSnap.id,
          appSnap.data() ?? {},
          round.availabilityGrid,
        ),
        round,
        privateSnap?.exists
          ? normalizeAdmissionApplicationPrivate(privateSnap.id, privateSnap.data() ?? {})
              .accessRequirements
          : "",
      );
    }
  }

  return {
    round: serialiseRoundForApplicant(round, now),
    stages,
    application,
    closesAt: round.closesAt,
    opensAt: round.opensAt,
  };
}

/**
 * The page's title and description, for either kind of round. Written once,
 * so an application form and a round of the older kind describe themselves in
 * the same words.
 */
function applyMetadata(label: string, state: string, facilitator: boolean): Metadata {
  return {
    title: `${state === "open" ? "Apply" : "Applications"}: ${label}`,
    description:
      state === "open"
        ? `${facilitator ? `Apply to facilitate on ${label}.` : `Apply to ${label}.`} Open to anyone with a NAISI account, including one you make in the next minute.`
        : state === "not-yet"
          ? `Applications for ${label} have not opened yet.`
          : `Applications for ${label} have closed.`,
    // A personal form is no use in search results, and the page renders
    // per-viewer state.
    robots: { index: false, follow: true },
  };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { roundId } = await params;

  // The same order as the page below. An application form is asked for first,
  // through the form's own applicant-safe read, which answers null for a form
  // that is still a draft or has been archived exactly as it does for a round
  // that is not a form. So a form nobody may see yet falls through to the
  // older loader with everything else, and takes the title every round that
  // is not there takes.
  const db = getAdminDb();
  const form = db ? await loadFormTitle(db, roundId, new Date()) : null;
  if (form) return applyMetadata(form.label, form.windowState, false);

  const loaded = await loadRound(roundId, null, false);
  if (!loaded) {
    return { title: "Applications", robots: { index: false, follow: true } };
  }
  const { round } = loaded;
  return applyMetadata(round.label, round.windowState, round.kind === "appointment");
}

export default async function ApplyPage({
  params,
  searchParams,
}: Params & { searchParams: Promise<{ step?: string | string[]; join?: string | string[] }> }) {
  const { roundId } = await params;
  const user = await getCurrentUser();
  // The session is already in hand, so this is `markerIsLive` rather than
  // `getLiveImpersonator`, which would read the session a second time.
  const viewingAs = markerIsLive(await getImpersonator(), user?.uid ?? null);

  // A round that is an APPLICATION FORM (one form a term, for every
  // programme) is the new form's to show. It answers null for anything else,
  // a form that is still a draft included, so every other round carries on
  // below exactly as it always has, and a draft form gets the 404 below.
  const { step, join } = await searchParams;
  const applicationForm = await renderApplicationForm({
    roundId,
    user,
    viewingAs,
    step: typeof step === "string" ? step : null,
    // The mark the form's own first step puts on the address it gives the
    // register route (`joinReturnFor`), so the form knows an arrival that
    // came back from an emailed link.
    fromJoinLink: join === "1",
  });
  if (applicationForm) return applicationForm;

  const loaded = await loadRound(roundId, user?.uid ?? null, !viewingAs);

  // A draft or archived round is a 404 rather than a "closed" card: unlike a
  // course, whose curriculum stays up between runs, a round nobody has opened
  // is not a public object at all. The older flow has no application form to
  // draw either: a form was shown above, or is as absent as any other draft.
  if (!loaded) notFound();

  const { round, stages, application, closesAt, opensAt } = loaded;
  // The kind decides what this form is CALLED on every surface of the page.
  // A facilitator round asks somebody to run a group, and a hero that says
  // nothing about that leaves them checking whether they opened the right
  // link.
  const copy = applyCopy(round.kind);
  const open = round.windowState === "open";
  const notYet = round.windowState === "not-yet";
  const returnTo = `/apply/${encodeURIComponent(roundId)}`;
  const nextParam = encodeURIComponent(returnTo);

  const dates = [
    open && closesAt ? `Closes ${formatRoundDeadline(closesAt)}` : null,
    notYet && opensAt ? `Opens ${formatRoundDate(opensAt)}` : null,
    round.decisionsByDate ? `Decisions by ${round.decisionsByDate}` : null,
  ].filter(Boolean) as string[];

  return (
    <section className={styles.page}>
      <div className="container">
        <header className={styles.hero}>
          {/* The year is the badge every round has wanted, so it keeps the
              accent. A facilitator round needs the kicker BESIDE it rather
              than instead of it: as a fallback it only ever showed on a round
              with no academic year set, which is nearly none of them, and
              "Facilitator applications" is the one word of chrome that tells
              somebody who followed a link what they are looking at. */}
          <div className={styles.badges}>
            <Badge tone="accent">{round.academicYear || copy.kicker}</Badge>
            {round.kind === "appointment" && round.academicYear ? (
              <Badge tone="neutral">{copy.kicker}</Badge>
            ) : null}
          </div>
          <h1 className={styles.title}>{round.label}</h1>
          {copy.standfirst ? (
            <p className={styles.kindNote}>{copy.standfirst}</p>
          ) : null}
          {dates.length > 0 ? (
            <p className={styles.dates}>
              {dates.map((bit, index) => (
                <span key={bit}>
                  {index > 0 ? (
                    <span aria-hidden="true" className={styles.dot}>
                      ·
                    </span>
                  ) : null}
                  {bit}
                </span>
              ))}
            </p>
          ) : null}
          {round.blurb ? <p className={styles.lede}>{round.blurb}</p> : null}
        </header>

        {!user ? (
          <Card padding="lg" className={styles.gate}>
            <h2 className={styles.gateTitle}>
              {open ? copy.signInTitle : "Sign in to check your application"}
            </h2>
            <p className={styles.gateBody}>
              {open ? (
                <>
                  Applications are tied to a NAISI account so your answers save
                  as you write them and you hear the outcome.{" "}
                  <strong>Any account can apply</strong>, including one you make
                  in the next minute, and one still waiting on committee
                  approval.
                </>
              ) : notYet ? (
                <>
                  There is nothing to fill in yet. When the form opens it will
                  be tied to a NAISI account, so making one now is the whole of
                  the head start available.
                </>
              ) : (
                <>
                  Applications have closed. If you sent one, sign in and it will
                  be here.
                </>
              )}
            </p>
            {/* An anchor styled as the primary action: Button renders a real
                <button> and takes no href. `next` rides through sign-in AND
                through registration, so a brand-new account lands back on this
                form rather than on /pending-approval. */}
            <Link href={`/login?next=${nextParam}`} className={styles.button}>
              {open ? copy.signInTitle : "Sign in"}
            </Link>
            {open || notYet ? (
              <p className={styles.gateNote}>
                No account yet?{" "}
                <Link href={`/register?next=${nextParam}`} className={styles.gateLink}>
                  Create one
                </Link>{" "}
                {open
                  ? "and we will bring you straight back to this form."
                  : "and this page will have the form on it the day it opens."}
              </p>
            ) : null}
          </Card>
        ) : user.role === "rejected" ? (
          <Card padding="lg" className={styles.gate}>
            <h2 className={styles.gateTitle}>This account cannot apply</h2>
            <p className={styles.gateBody}>
              Your NAISI account is not able to send applications. If you think
              that is a mistake, reply to any email from us and we will take a
              look.
            </p>
          </Card>
        ) : (
          <ApplyFlow
            round={round}
            stages={stages}
            application={application}
            pendingNote={user.role === "pending"}
          />
        )}
      </div>
    </section>
  );
}
