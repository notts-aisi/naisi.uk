import Link from "next/link";
import { Chip } from "@/features/applications/editor/controls";
import shared from "@/features/applications/editor/editor.module.css";
import home from "@/features/applications/editor/FormHome.module.css";
import styles from "@/features/applications/editor/ProgrammesList.module.css";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import kit from "@/features/applications/kit/kit.module.css";
import { canRunTerm } from "@/lib/applications/access";
import {
  loadProgrammesList,
  type ProgrammeCard,
  type ProgrammesList,
  type TermEntry,
} from "@/lib/applications/programmes/list";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * PROGRAMMES: every programme of a term that is not over that this reader
 * may open, a section a term, then the terms that are over.
 *
 * Behind the admissions tree's gate, and asked of it again here. What is
 * listed is decided on the server (`loadProgrammesList`): an admin every
 * programme, a lead the programmes they lead, a reviewer the ones they
 * review, and nothing anybody could not already open from the term's page.
 * Somebody the gate admits who is on no form sees the area's own empty
 * state, the one the list of forms draws.
 *
 * Each card has one first button: the programme's Overview for an admin and
 * its lead, and its applications for a reviewer, in the words the term's
 * page uses for them. "Review 3" sits beside the first for a lead with
 * applications waiting for them.
 */
export default async function ProgrammesPage() {
  const user = await requireAdmissionsPage();
  const db = getAdminDb();
  const list: ProgrammesList = db
    ? await loadProgrammesList(db, user)
    : { terms: [], earlier: [], reader: user.role === "admin" ? "admin" : "none" };
  const admin = canRunTerm(user);
  const nothing = list.terms.length === 0 && list.earlier.length === 0;

  return (
    <ApplicationsRoot className={shared.page}>
      <header className={shared.head}>
        <div className={shared.headMain}>
          <div className={shared.titleRow}>
            <h1 className={shared.title}>Programmes</h1>
          </div>
          {!nothing && <p className={shared.lede}>{LEDE[list.reader]}</p>}
        </div>
      </header>

      {nothing ? (
        <section className={`${shared.card} ${shared.empty}`}>
          <h2 className={shared.cardTitle}>
            {admin ? "No application forms yet" : "You are not on an application form at the moment"}
          </h2>
          <p className={shared.cardNote}>
            {admin
              ? "Make one for the term, add its programmes, then write their questions."
              : "When an admin names you a programme’s lead or one of its reviewers, its form is listed here."}
          </p>
        </section>
      ) : (
        <>
          {list.terms.map((term) => (
            <TermSection key={term.id} term={term} />
          ))}
          {(admin || list.earlier.length > 0) && <EarlierTerms terms={list.earlier} />}
        </>
      )}
    </ApplicationsRoot>
  );
}

const LEDE: Record<ProgrammesList["reader"], string> = {
  admin:
    "Every programme of a term that isn’t over. Open one to run it: its groups, weeks, people and settings are all inside.",
  lead: "The programmes you lead. Open one to run it.",
  reviewer: "The programmes you review. Open one to read its applications.",
  both: "The programmes you lead or review.",
  none: "",
};

const STAGE_TONE: Record<TermEntry["stage"], "neutral" | "accent" | "live"> = {
  "Not open yet": "neutral",
  "Taking applications": "accent",
  Deciding: "accent",
  Starting: "neutral",
  Running: "live",
};

function TermSection({ term }: { term: TermEntry }) {
  return (
    <section className={styles.term} aria-label={term.label}>
      <div className={styles.termHead}>
        <h2 className={styles.termName}>{term.label}</h2>
        <Chip tone={STAGE_TONE[term.stage]}>{term.stage}</Chip>
      </div>
      <div className={styles.termLine}>
        <p>{term.line}</p>
        <Link href={term.href} className={styles.termLink}>
          {term.pageLabel}
        </Link>
      </div>
      <div className={home.grid}>
        {term.programmes.map((programme) => (
          <Card key={programme.id} programme={programme} />
        ))}
      </div>
    </section>
  );
}

function Card({ programme }: { programme: ProgrammeCard }) {
  return (
    <section className={home.programme} aria-label={programme.name}>
      <div className={kit.mono}>{programme.kindWord}</div>
      <h3 className={home.programmeName}>{programme.name}</h3>
      <p className={home.programmeNote}>{programme.lead}</p>
      {programme.line && <p className={styles.cardLine}>{programme.line}</p>}
      {programme.needsYou && <p className={styles.needsYou}>{programme.needsYou}</p>}
      <div className={styles.cardFoot}>
        <Link href={programme.open.href} className={kit.primary}>
          {programme.open.label}
        </Link>
        {programme.review && (
          <Link href={programme.review.href} className={shared.btn}>
            {programme.review.label}
          </Link>
        )}
      </div>
    </section>
  );
}

function EarlierTerms({ terms }: { terms: ProgrammesList["earlier"] }) {
  return (
    <section className={`${shared.card} ${styles.earlier}`} aria-label="Earlier terms">
      <div className={styles.earlierHead}>
        <h2 className={shared.cardTitle}>Earlier terms</h2>
        {terms.length === 0 && <Chip>None yet</Chip>}
      </div>
      <p className={shared.cardNote}>
        A term moves here once its last session is over. Its programmes leave the menu then, and everything in them
        stays.
      </p>
      {terms.length > 0 && (
        <ul className={styles.earlierList}>
          {terms.map((term) => (
            <li key={term.id}>
              <Link href={term.href} className={styles.termLink}>
                {term.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
