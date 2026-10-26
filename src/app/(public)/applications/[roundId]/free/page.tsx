import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BackIcon } from "@/features/applications/apply/icons";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import kit from "@/features/applications/kit/kit.module.css";
import WhenYoureFreeEditor from "@/features/applications/status/WhenYoureFreeEditor";
import styles from "@/features/applications/status/status.module.css";
import { VIEW_AS_NOTICE } from "@/features/applications/viewAsNotice";
import { loadWhenFree } from "@/lib/applications/status/whenFree";
import { getAdminDb } from "@/lib/firebase/admin";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "Change when you’re free" (Q7: boards st-application-phone, st-late-phone):
 * the form's own editor, for somebody holding a place on a fellowship until
 * Publish has told them their group.
 *
 * Whether it is theirs to change is `loadWhenFree`'s to say, by the session's
 * own uid; anybody else, and anybody once their group is told, is sent back
 * to their application page, which says where they stand. A view-as session
 * is told it may not, and nothing of the member's is read.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "When you’re free", robots: { index: false } };

type Params = { params: Promise<{ roundId: string }> };

export default async function WhenYoureFreePage({ params }: Params) {
  const { roundId } = await params;
  const page = `/applications/${encodeURIComponent(roundId)}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`${page}/free`)}`);
  const root = `${styles.vars} ${styles.root}`;

  if (markerIsLive(await getImpersonator(), user.uid)) {
    return (
      <ApplicationsRoot className={root}>
        <div className={styles.shell}>
          <div className={styles.column}>
            <h1 className={styles.title}>{VIEW_AS_NOTICE.title}</h1>
            <div className={`${styles.card} ${styles.body}`}>
              <p>{VIEW_AS_NOTICE.body}</p>
            </div>
          </div>
        </div>
      </ApplicationsRoot>
    );
  }

  const db = getAdminDb();
  const free = db ? await loadWhenFree(db, roundId, user.uid, new Date()) : null;
  if (!free) redirect(page);

  return (
    <ApplicationsRoot className={root}>
      <div className={styles.shell}>
        <div className={styles.bar}>
          <Link href={`/applications/${encodeURIComponent(roundId)}#when-youre-free`} className={styles.back}>
            <BackIcon size={20} />
            <span>Your application</span>
          </Link>
        </div>
        <div className={styles.column}>
          <div>
            <div className={`${kit.mono} ${styles.eyebrow}`}>Your application</div>
            <h1 className={styles.title}>When you’re free</h1>
          </div>
          <WhenYoureFreeEditor roundId={roundId} grid={free.grid} availability={free.availability} line={free.line} />
        </div>
      </div>
    </ApplicationsRoot>
  );
}
