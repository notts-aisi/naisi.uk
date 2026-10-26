import Link from "next/link";
import { redirect } from "next/navigation";
import HandInForm from "@/features/courses/team/HandInForm";
import styles from "@/features/courses/team/team.module.css";
import { getRunAccess } from "@/features/courses/runAccess";
import weekly from "@/features/courses/weekly/weekly.module.css";
import { loadHandInPage } from "@/lib/courses/teamPage/load";
import { HAND_IN } from "@/lib/courses/teamPage/words";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * A TEAM'S ONE HAND-IN (board en-handin-phone, drawn at 390 and laid out the
 * same way, in one column, at 1440): a link, a summary of up to 200 words
 * and who did what, which everybody in the team sees and can change until
 * 23:59 in London on the day it is due. Reached from the team's page.
 *
 * WHO. As the team's page: somebody among a team's people who has been told
 * their team. Anybody else goes back to the run's home. The programme's lead
 * and admins read every team's hand-in on the Teams tab.
 */

export const dynamic = "force-dynamic";

function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.icon}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export default async function HandInPageRoute({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const home = `/learn/${encodeURIComponent(runId)}`;

  const access = await getRunAccess(runId);
  if (!access) redirect("/learn");
  const db = getAdminDb();
  if (!db) redirect(home);

  const outcome = await loadHandInPage(db, access.user, runId);
  if (!outcome.ok) redirect(home);
  const { view } = outcome;

  return (
    <div className={styles.handInPage}>
      <div className={weekly.bar}>
        <div className={weekly.barStart}>
          <Link href={view.back.href} className={weekly.back}>
            <ChevronLeft />
            <span>{view.back.label}</span>
          </Link>
        </div>
        <div className={weekly.barTitle}>{HAND_IN}</div>
        <div className={weekly.barEnd} />
      </div>
      <header>
        <p className={weekly.eyebrow}>{view.eyebrow}</p>
        <h1 className={styles.handInTitle}>{view.title}</h1>
        <p className={styles.lede}>{view.lede}</p>
        {view.handedInLine ? <p className={styles.quiet}>{view.handedInLine}</p> : null}
      </header>
      <div className={styles.fieldGap} aria-hidden="true" />
      <HandInForm view={view} />
    </div>
  );
}
