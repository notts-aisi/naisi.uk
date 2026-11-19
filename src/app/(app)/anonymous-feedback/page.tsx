import type { Metadata } from "next";
import SocietyFeedbackForm from "@/features/societyFeedback/SocietyFeedbackForm";
import styles from "@/features/societyFeedback/societyFeedback.module.css";
import { getAdminDb } from "@/lib/firebase/admin";
import { termProgrammes } from "@/lib/societyFeedback/programmes";
import { FORM_WORDS } from "@/lib/societyFeedback/words";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: FORM_WORDS.title,
  robots: { index: false, follow: false },
};

/**
 * Anonymous feedback, one form for the whole society, for any signed-in
 * member (docs/surveys.md, "Anonymous feedback for the whole society").
 *
 * In the signed-in area, so the authed layout is the gate: a stranger is sent
 * to sign in, a waiting account to the waiting page and a refused one home.
 * THIS PAGE READS NOTHING ABOUT ITS READER: no session, no cookie, no header.
 * It reads this term's programmes and their weeks (every application form,
 * then one run record per programme) and hands the form only those.
 */
export default async function AnonymousFeedbackPage() {
  const db = getAdminDb();
  const programmes = db ? await termProgrammes(db, new Date()) : [];
  return (
    <div className={styles.screen}>
      <header className={styles.head}>
        <h1 className={styles.title}>{FORM_WORDS.title}</h1>
        <p className={styles.intro}>{FORM_WORDS.intro}</p>
      </header>
      <SocietyFeedbackForm
        programmes={programmes.map((programme) => ({
          roundId: programme.roundId,
          programmeId: programme.programmeId,
          name: programme.name,
          weeks: programme.weeks,
        }))}
      />
    </div>
  );
}
