import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { EDITED_IN_THE_APPLICATION_FORM } from "@/lib/admissions/formFence";
import ApplicationFormDangerZone from "./ApplicationFormDangerZone";
import styles from "./RoundEditor.module.css";

/**
 * What the older round page shows when the round it was asked for is an
 * application form.
 *
 * The older editor edits rounds of the older kind. Pointed at a form it would
 * draw sections a form does not have and offer saves that every route behind
 * them refuses, so none of it renders: the page shows the form's name, one
 * sentence saying where a form is edited, and, for an admin, the danger zone.
 * See `src/lib/admissions/formFence.ts` for the rule.
 *
 * A server component. The sentence is the same one the older routes answer
 * with, read from the same constant, so the page and a refused save cannot
 * come to say different things.
 *
 * The header reuses the older editor's own classes so the two pages at this
 * address look like one console.
 */
export default function ApplicationFormStaffNotice({
  roundId,
  label,
  academicYear,
  isAdmin,
}: {
  roundId: string;
  label: string;
  academicYear: string;
  isAdmin: boolean;
}) {
  return (
    <div className={styles.column}>
      <header className={styles.head}>
        <Link className={styles.back} href="/admin/admissions">
          ← All rounds
        </Link>
        <div className={styles.headRow}>
          <h1 className={styles.title}>{label}</h1>
          <Badge tone="accent">Application form</Badge>
        </div>
      </header>

      <section className={styles.section}>
        <p style={{ margin: 0 }}>{EDITED_IN_THE_APPLICATION_FORM}</p>
      </section>

      {isAdmin && (
        <ApplicationFormDangerZone
          roundId={roundId}
          label={label}
          subtitle={academicYear ? `Application form · ${academicYear}` : "Application form"}
        />
      )}
    </div>
  );
}
