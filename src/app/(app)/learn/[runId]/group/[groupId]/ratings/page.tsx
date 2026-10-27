import Link from "next/link";
import { redirect } from "next/navigation";
import { getRunAccess, getSessionUser } from "@/features/courses/runAccess";
import weekly from "@/features/courses/weekly/weekly.module.css";
import RatingsBoard from "@/features/ratings/RatingsBoard";
import styles from "@/features/ratings/ratings.module.css";
import { getAdminDb } from "@/lib/firebase/admin";
import { loadRatingsView } from "@/lib/ratings/view";
import { RATINGS_WORDS } from "@/lib/ratings/words";

/**
 * A GROUP'S RATINGS, FOR ITS FACILITATORS (the programme impact
 * questionnaire's facilitator rating, and on an incubator its mentor rating):
 * once the run's last session is over, a card per fellow of the group, about
 * two minutes a person, with the sessions they came to read from the
 * register.
 *
 * WHO: a live facilitator of THIS group, who rates the fellows of their group
 * but never themselves or a co-facilitator, and sees only what they gave; an
 * admin, who may rate anyone but themselves and a co-facilitator and reads
 * what everybody said. Everybody else is sent to the run's home, never told
 * whether the group exists. The programme's lead rates and reads on the
 * programme's own Ratings page. The route the forms post to re-derives the
 * same access and is the real boundary.
 *
 * NOTHING HERE IS EVER SHOWN TO THE PERSON RATED: the viewer is never one of
 * the rows (`loadRatingsView`).
 */

export const dynamic = "force-dynamic";

export default async function GroupRatingsPage({ params }: { params: Promise<{ runId: string; groupId: string }> }) {
  const { runId, groupId } = await params;

  const access = await getRunAccess(runId);
  if (!access) {
    const user = await getSessionUser();
    redirect(user ? "/learn" : "/login");
  }

  const runHome = `/learn/${encodeURIComponent(runId)}`;
  if (!groupId || groupId.includes("/") || groupId === "." || groupId === "..") redirect(runHome);

  const db = getAdminDb();
  if (!db) redirect(runHome);

  const view = await loadRatingsView(db, access.user, runId, groupId, new Date());
  const group = access.groups.find((each) => each.id === groupId);
  if (!view || !group) redirect(runHome);

  const groupName = group.name || "Group";
  const groupPath = `${runHome}/group/${encodeURIComponent(groupId)}`;
  return (
    <div className={styles.page}>
      <div className={weekly.bar}>
        <div className={weekly.barStart}>
          <Link href={groupPath} className={weekly.back}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
              <path d="M15 6l-6 6 6 6" />
            </svg>
            <span>{RATINGS_WORDS.backTo(groupName)}</span>
          </Link>
        </div>
        <div className={weekly.barEnd} />
      </div>
      <header className={styles.head}>
        <h1 className={styles.title}>{RATINGS_WORDS.title(groupName)}</h1>
        <p className={styles.intro}>{view.state === "open" && view.reader ? RATINGS_WORDS.readerIntro : RATINGS_WORDS.intro}</p>
      </header>
      <RatingsBoard view={view} showGroupNames={false} />
    </div>
  );
}
