import "server-only";
import type { ReactNode } from "react";
import Link from "next/link";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentCollaborator, type SessionUser } from "@/lib/firebase/session";
import { projectFormForApplicant } from "@/lib/applications/applicant/project";
import { loadApplicantView, loadVisibleForm } from "@/lib/applications/applicant/store";
import type { ApplicantApplication, ApplicantForm } from "@/lib/applications/applicant/types";
import { loadForm } from "@/lib/applications/repo";
import ApplicationForm from "./ApplicationForm";
import { closedOnLabel } from "./closedOn";
import JoinStep from "./JoinStep";
import { isStepId } from "./steps";
import styles from "./form.module.css";

/**
 * What `/apply/[roundId]` shows when the round is an application form.
 *
 * The page calls `renderApplicationForm` first. It answers null for anything
 * that is NOT a form an applicant may see (a round of the older kind, a round
 * that does not exist, a form still being written, an archived one), and the
 * page then carries on exactly as it did before this existed. So a draft form
 * gets the very same answer as a round that was never there, from the very
 * same code.
 *
 * Everything is read here, on the server, through the applicant-safe loader,
 * and the form is handed its opening state: the same projections the GET
 * route answers with.
 *
 * ## Somebody with no join request is drawn the first step, and only that
 *
 * A visitor who is not signed in, and an account that has signed in and never
 * sent a join request, both get `JoinStep`: the form's first step, About you,
 * which for them is the join request. It is handed the form's id, its name
 * and the two dates the open form shows, and NOTHING ELSE of the form: not a
 * programme, not a question. Those are read only for somebody who has a join
 * request, because that is the first moment an application can be saved for
 * them.
 *
 * A session does not say whether there is a join request (the session reads
 * a missing account document as an account that is waiting), so that is
 * asked of the document itself: `view.joined`.
 */

function StateCard({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <div className={styles.stateCard}>
        <h1 className={styles.stateTitle}>{title}</h1>
        {children}
        {actions ? <div className={styles.stateActions}>{actions}</div> : null}
      </div>
    </div>
  );
}

function NotYet({ form, signedIn, returnTo }: { form: ApplicantForm; signedIn: boolean; returnTo: string }) {
  return (
    <StateCard
      title="Applications aren’t open yet"
      actions={
        signedIn ? null : (
          <Link href={`/register?next=${returnTo}`} className={styles.ghost}>
            Make an account
          </Link>
        )
      }
    >
      <p className={styles.stateBody}>
        {form.opensLabel ? (
          <>
            {form.label} applications open on <span className={styles.together}>{form.opensLabel}</span>.
          </>
        ) : (
          `${form.label} applications open soon.`
        )}
        {signedIn ? "" : " You’ll need a naisi.uk account to apply, and you can make one now."}
      </p>
    </StateCard>
  );
}

function Closed({
  form,
  closedOn,
  application,
  signedIn,
  returnTo,
}: {
  form: ApplicantForm;
  /** The day applications closed, or null when an admin closed them before the day on the form. */
  closedOn: string | null;
  application: ApplicantApplication | null;
  signedIn: boolean;
  returnTo: string;
}) {
  return (
    <StateCard
      title="Applications have closed"
      actions={
        !signedIn ? (
          <Link href={`/login?next=${returnTo}`} className={styles.ghost}>
            Sign in
          </Link>
        ) : application?.sent ? (
          // Where their application, and later their result, is. Without it
          // this card is the end of the road for somebody who has applied.
          <Link href={`/applications/${encodeURIComponent(form.id)}`} className={styles.ghost}>
            See your application
          </Link>
        ) : null
      }
    >
      <p className={styles.stateBody}>
        {closedOn ? (
          <>
            {form.label} applications closed on <span className={styles.together}>{closedOn}</span>.
          </>
        ) : (
          `${form.label} applications have closed.`
        )}
      </p>
      {!signedIn ? (
        <p className={styles.stateBody}>If you sent an application, sign in to see where it stands.</p>
      ) : application?.sent ? (
        <p className={styles.stateBody}>
          We have your application
          {application.sentLabel ? (
            <>
              , sent on <span className={styles.together}>{application.sentLabel}</span>
            </>
          ) : null}
          .
          {/* Once their own result is out, the day everybody hears is behind them. */}
          {form.decisionsLabel && !application.result ? (
            <>
              {" "}
              Everyone hears on <span className={styles.together}>{form.decisionsLabel}</span>.
            </>
          ) : null}
        </p>
      ) : application ? (
        <p className={styles.stateBody}>
          You started an application and didn’t send it, so we don’t have one from you. If that’s not right,
          email <a href="mailto:ai-safety@uonsu.com" className={styles.inlineLink}>ai-safety@uonsu.com</a>.
        </p>
      ) : null}
    </StateCard>
  );
}

export async function renderApplicationForm({
  roundId,
  user,
  viewingAs,
  step,
}: {
  roundId: string;
  user: SessionUser | null;
  /** An admin is looking at the page as this member. */
  viewingAs: boolean;
  /** `?step=` from the address, when there is one. */
  step: string | null;
}): Promise<ReactNode | null> {
  const db = getAdminDb();
  if (!db) return null;
  const now = new Date();
  const returnTo = encodeURIComponent(`/apply/${roundId}`);

  if (!user) {
    const loaded = await loadVisibleForm(db, roundId, now);
    if (!loaded) return null;
    const form = projectFormForApplicant(loaded.form, now);
    return (
      <ApplicationsRoot className={`${styles.tokens} ${styles.root}`}>
        {form.windowState === "open" ? (
          <JoinStep
            roundId={form.id}
            label={form.label}
            closesLabel={form.closesLabel}
            decisionsLabel={form.decisionsLabel}
            signedIn={false}
            signedInAs={null}
          />
        ) : form.windowState === "not-yet" ? (
          <NotYet form={form} signedIn={false} returnTo={returnTo} />
        ) : (
          <Closed
            form={form}
            closedOn={closedOnLabel(loaded.form.round.closesAt, form.closesLabel, now)}
            application={null}
            signedIn={false}
            returnTo={returnTo}
          />
        )}
      </ApplicationsRoot>
    );
  }

  if (user.role === "rejected") {
    // Refused before anything of theirs is read, and only for a form that is
    // there to be refused from.
    if (!(await loadVisibleForm(db, roundId, now))) return null;
    return (
      <ApplicationsRoot className={`${styles.tokens} ${styles.root}`}>
        <StateCard title="This account can’t apply">
          <p className={styles.stateBody}>
            Your naisi.uk account isn’t able to send applications. If you think that’s a mistake, email{" "}
            <a href="mailto:ai-safety@uonsu.com" className={styles.inlineLink}>
              ai-safety@uonsu.com
            </a>{" "}
            and we’ll take a look.
          </p>
        </StateCard>
      </ApplicationsRoot>
    );
  }

  const view = await loadApplicantView(db, roundId, user.uid, now);
  if (!view) return null;

  if (!view.joined && view.form.windowState === "open") {
    // Signed in, and no join request. An external collaborator is one such
    // account and is not somebody this form is for: making a join request on
    // their account would leave one person holding two kinds of membership.
    if (await getCurrentCollaborator()) {
      return (
        <ApplicationsRoot className={`${styles.tokens} ${styles.root}`}>
          <StateCard
            title="You’re signed in as a collaborator"
            actions={
              <Link href="/collaborator" className={styles.ghost}>
                Go to your collaborator space
              </Link>
            }
          >
            <p className={styles.stateBody}>
              These programmes are for University of Nottingham students and staff. To apply, sign out and use
              a student or staff account. If that’s not right, email{" "}
              <a href="mailto:ai-safety@uonsu.com" className={styles.inlineLink}>
                ai-safety@uonsu.com
              </a>
              .
            </p>
          </StateCard>
        </ApplicationsRoot>
      );
    }
    // The same place in the tree as the signed-out step above, so a visitor
    // who signs in part way through keeps the page they were typing on.
    return (
      <ApplicationsRoot className={`${styles.tokens} ${styles.root}`}>
        <JoinStep
          roundId={view.form.id}
          label={view.form.label}
          closesLabel={view.form.closesLabel}
          decisionsLabel={view.form.decisionsLabel}
          signedIn
          signedInAs={user.email ?? null}
        />
      </ApplicationsRoot>
    );
  }

  // Only a closed form asks when it closed, so only a closed form reads its time.
  const stored = view.form.windowState === "closed" ? await loadForm(db, roundId) : null;
  const closedOn = closedOnLabel(stored?.round.closesAt ?? null, view.form.closesLabel, now);

  return (
    <ApplicationsRoot className={`${styles.tokens} ${styles.root}`}>
      {view.form.windowState === "open" ? (
        <ApplicationForm
          form={view.form}
          sets={view.sets}
          application={view.application}
          account={view.account}
          initialStep={isStepId(step) ? step : null}
          pending={user.role === "pending"}
          viewingAs={viewingAs}
        />
      ) : view.form.windowState === "not-yet" ? (
        <NotYet form={view.form} signedIn returnTo={returnTo} />
      ) : (
        <Closed
          form={view.form}
          closedOn={closedOn}
          application={view.application}
          signedIn
          returnTo={returnTo}
        />
      )}
    </ApplicationsRoot>
  );
}
