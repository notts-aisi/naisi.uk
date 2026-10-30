import type { Metadata } from "next";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { AnonymousFormLink } from "@/features/anonymousFeedback/AfterTheSurvey";
import AnswerScreen from "@/features/surveys/answer/AnswerScreen";
import { anonymousFormLinkFor } from "@/lib/anonymousFeedback/forms";
import { getAdminDb } from "@/lib/firebase/admin";
import { isEventSurvey } from "@/lib/firestore/surveys";
import { answerScreenFor, type AnswerScreen as Screen } from "@/lib/surveys/answerView";
import { openBlanksLink } from "@/lib/surveys/blanksStore";
import { blanksScreenFor } from "@/lib/surveys/blanksView";
import { eventAnswerScreen } from "@/lib/surveys/events/answerView";
import { openLink } from "@/lib/surveys/repo";
import { ANSWER_WORDS, STATE_WORDS } from "@/lib/surveys/words";
import styles from "./survey.module.css";

/**
 * A PERSON'S SURVEY, BY THEIR PERSONAL LINK (sv-before-phone), with no
 * sign-in: the secret in the address opens their own row and nobody else's.
 * Signed in or not, the page is the same; the answers are kept against the
 * person the link was made for.
 *
 * WHY IT IS OUTSIDE THE ROUTE GROUPS. A person opens it from an email on a
 * phone, often signed out, and the signed-in area would send them to sign in
 * first. It sits under the root layout alone, like /links, with its own small
 * brand link home, and reads from the first HTML that arrives: every question
 * is a real form control before the page's script does anything.
 *
 * The same address opens a link of the questions somebody left blank
 * (`openBlanksLink`), minted by an admin's press: only those questions, and
 * never an earlier answer (`blanksScreenFor`).
 *
 * Opening it records nothing: no "opened", no time, no address. A link that
 * opens nothing, a survey that has closed and one already answered each get
 * one calm sentence rendered here (never `notFound()`, which answers with an
 * empty body until the scripts arrive). The address carries a secret, so the
 * page sends no referrer anywhere and is kept out of search.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: ANSWER_WORDS.eyebrow,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SurveyLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getAdminDb();
  const now = new Date();
  let screen: Screen = { state: "message", ...STATE_WORDS.noSurvey, consent: null };
  // The anonymous form the survey at a programme's end links to, once the
  // person has sent it: the same address for everybody on the programme.
  let anonymousForm: string | null = null;
  if (db) {
    const target = await openLink(db, token);
    if (target.kind === "event") {
      // A survey after an event, by the person's own link: a guest's as an account's.
      screen = await eventAnswerScreen(db, target.survey, {
        respondent: target.person.respondent,
        signedInAs: null,
        answered: target.person.answered,
        submit: { kind: "link", token },
        now,
      });
    } else if (target.kind === "test" && isEventSurvey(target.survey)) {
      screen = await eventAnswerScreen(db, target.survey, { respondent: null, signedInAs: null, answered: false, submit: { kind: "test" }, now });
    } else if (target.kind === "test") {
      screen = await answerScreenFor(db, target.survey, {
        uid: null,
        answered: false,
        answeredAt: null,
        submit: { kind: "test" },
        now,
      });
    } else if (target.kind === "person") {
      screen = await answerScreenFor(db, target.survey, {
        uid: target.person.respondent.uid,
        answered: target.person.answered,
        answeredAt: null,
        submit: { kind: "link", token },
        now,
        person: target.person,
      });
      anonymousForm = await anonymousFormLinkFor(db, target.survey.id, now);
    } else {
      // A link of the questions somebody left blank, which an admin's press
      // sent them: only those questions, never an earlier answer.
      const blanks = await openBlanksLink(db, token);
      if (blanks) screen = await blanksScreenFor(db, blanks, { submit: { kind: "link", token }, signedInAs: null, now });
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.frame}>
        <div className={styles.bar}>
          <Link href="/" prefetch={false} className={styles.brand} aria-label="NAISI home">
            <BrandMark size={28} />
          </Link>
          <span className={styles.barTitle}>{ANSWER_WORDS.eyebrow}</span>
          <span className={styles.barEnd} aria-hidden="true" />
        </div>
        <div className={styles.body}>
          <AnonymousFormLink href={anonymousForm}>
            <AnswerScreen screen={screen} />
          </AnonymousFormLink>
        </div>
      </div>
    </main>
  );
}
