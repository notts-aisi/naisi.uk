import "server-only";
import type { ReactNode } from "react";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import kit from "@/features/applications/kit/kit.module.css";
import { getAdminDb } from "@/lib/firebase/admin";
import type { SessionUser } from "@/lib/firebase/session";
import { formIsThere, loadStatus } from "@/lib/applications/status/load";
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
 * the data layer and by the session's own uid.
 *
 * An account that is still waiting is an applicant and sees its page. An
 * account the committee has refused is told so, and nothing of its own is
 * read first.
 */
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
      <StatusPage roundId={loaded.roundId} view={loaded.view} />
    </ApplicationsRoot>
  );
}
