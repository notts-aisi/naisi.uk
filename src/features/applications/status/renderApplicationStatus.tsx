import "server-only";
import type { ReactNode } from "react";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import kit from "@/features/applications/kit/kit.module.css";
import { VIEW_AS_NOTICE } from "@/features/applications/viewAsNotice";
import { getAdminDb } from "@/lib/firebase/admin";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";
import type { SessionUser } from "@/lib/firebase/session";
import { loadForm } from "@/lib/applications/repo";
import { formIsThere, loadStatus } from "@/lib/applications/status/load";
import type { StatusView } from "@/lib/applications/status/view";
import { closedOnLabel } from "../apply/closedOn";
import StatusPage from "./StatusPage";
import styles from "./status.module.css";

/**
 * What `/applications/[roundId]` shows when the round is an application form.
 *
 * The page calls this first, with the signed-in caller. It answers null for
 * anything that is NOT a form this caller may be told about (a round of the
 * older kind, an id that addresses nothing, a form that is still a draft or
 * has been archived and that they never applied on), and the page then
 * carries on exactly as it did before this existed. So a hidden form gets
 * the very same answer as a round that was never there, from the same code.
 *
 * Everything is read here, on the server, through the applicant-safe half of
 * the data layer and by the session's own uid. A client component on this
 * page is handed the form's id and what it should say, never a document.
 *
 * An account that is still waiting is an applicant and sees its page. An
 * account the committee has refused is told so, and nothing of its own is
 * read first.
 *
 * A VIEW-AS SESSION IS NOT THE APPLICANT. While an admin is viewing the site
 * as a member, the member's application is not read: this asks only whether
 * the round is an application form, and draws a notice for one. That is
 * asked before `loadStatus`, the first read of anything of the member's. For
 * a round that is not a form it answers null as it always has, so the page
 * carries on to the older read-back, which never reads a form's application.
 */
/**
 * The view, with the closing day taken out when it has not come yet.
 *
 * An admin can close a form before the day written on it. The page would
 * then say applications "closed on" a day that is still ahead. With the day
 * taken out, the page's own words for a form with no day are used instead.
 * Only the two views that print the day cost the extra read: nobody's
 * application here on a closed form, and a sent one that can no longer change.
 */
async function withHonestClosingDay(
  db: NonNullable<ReturnType<typeof getAdminDb>>,
  roundId: string,
  view: StatusView,
  now: Date,
): Promise<StatusView> {
  const printsTheDay =
    (view.kind === "none" && view.window === "closed") || (view.kind === "sent" && !view.canChange);
  if (!printsTheDay || view.closesLabel === null) return view;
  const form = await loadForm(db, roundId);
  const label = closedOnLabel(form?.round.closesAt ?? null, view.closesLabel, now);
  return label === null ? { ...view, closesLabel: null } : view;
}

export async function renderApplicationStatus({
  roundId,
  user,
}: {
  roundId: string;
  user: SessionUser;
}): Promise<ReactNode | null> {
  const db = getAdminDb();
  if (!db) return null;
  const now = new Date();
  const root = `${styles.vars} ${styles.root}`;

  // The session is already in hand, so this is `markerIsLive` rather than a
  // second read of it. A marker left over from a session that has ended (the
  // admin is signed in as themselves again) is not a session.
  const viewingAs = markerIsLive(await getImpersonator(), user.uid);
  if (viewingAs) {
    if (!(await loadForm(db, roundId))) return null;
    return (
      <ApplicationsRoot className={root}>
        <div className={styles.shell}>
          <div className={styles.column}>
            <div>
              <div className={`${kit.mono} ${styles.eyebrow}`}>Applications</div>
              <h1 className={styles.title}>{VIEW_AS_NOTICE.title}</h1>
            </div>
            <div className={`${styles.card} ${styles.body}`}>
              <p>{VIEW_AS_NOTICE.body}</p>
            </div>
          </div>
        </div>
      </ApplicationsRoot>
    );
  }

  if (user.role === "rejected") {
    if (!(await formIsThere(db, roundId, now))) return null;
    return (
      <ApplicationsRoot className={root}>
        <div className={styles.shell}>
          <div className={styles.column}>
            <div>
              <div className={`${kit.mono} ${styles.eyebrow}`}>Applications</div>
              <h1 className={styles.title}>This account can’t apply</h1>
            </div>
            <div className={`${styles.card} ${styles.body}`}>
              <p>
                Your naisi.uk account isn’t able to send applications. If you think that’s a mistake, email{" "}
                <a href="mailto:ai-safety@uonsu.com" className={styles.link}>
                  ai-safety@uonsu.com
                </a>{" "}
                and we’ll take a look.
              </p>
            </div>
          </div>
        </div>
      </ApplicationsRoot>
    );
  }

  const loaded = await loadStatus(db, roundId, user.uid, now);
  if (!loaded) return null;

  return (
    <ApplicationsRoot className={root}>
      <StatusPage
        roundId={loaded.roundId}
        view={await withHonestClosingDay(db, loaded.roundId, loaded.view, now)}
        viewingAs={viewingAs}
      />
    </ApplicationsRoot>
  );
}
