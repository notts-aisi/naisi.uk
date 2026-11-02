import Link from "next/link";
import PageHead from "@/components/ui/PageHead";
import { AdminPage } from "@/features/admin/adminList";
import KairosFileButton from "@/features/kairos/KairosFileButton";
import styles from "@/features/kairos/kairos.module.css";
import { readRunEndById } from "@/lib/courses/finishing/record";
import { getAdminDb } from "@/lib/firebase/admin";
import { listKairosProgrammes } from "@/lib/kairos/programmes";
import { KAIROS_FILE_WORDS, KAIROS_REPORT_WORDS } from "@/lib/kairos/words";
import { REPORTS_WORDS } from "@/lib/reports/words";

export const dynamic = "force-dynamic";

/**
 * Run NAISI › Reports › Kairos: what goes to Kairos, programme by programme.
 * Each programme that names a course run has the Kairos file (a logged
 * download, once its last session is over) and the Kairos report of totals.
 *
 * Under `(admin-only)`, so the group's layout (`requireAdminPage()`) is the
 * gate, and the file's own route asks again. Read on the server.
 */
export default async function KairosPage() {
  const db = getAdminDb();
  const now = new Date();
  const programmes = db ? await listKairosProgrammes(db) : [];
  const ends = db ? await Promise.all(programmes.map((programme) => readRunEndById(db, programme.runId, now))) : [];
  return (
    <AdminPage wide>
      <PageHead
        title={KAIROS_FILE_WORDS.title}
        description={KAIROS_FILE_WORDS.lede}
        crumb={<Link href="/admin/reports">{REPORTS_WORDS.title}</Link>}
      />
      {programmes.length === 0 ? (
        <p className={styles.line}>{KAIROS_FILE_WORDS.none}</p>
      ) : (
        <ul className={styles.list}>
          {programmes.map((programme, index) => {
            const end = ends[index] ?? null;
            return (
              <li key={`${programme.roundId}/${programme.programmeId}`} className={styles.card}>
                <div className={styles.cardHead}>
                  <h2 className={styles.name}>{programme.name}</h2>
                  <p className={styles.meta}>{programme.term}</p>
                </div>
                <p className={styles.line}>{KAIROS_FILE_WORDS.holds}</p>
                <div className={styles.actions}>
                  <Link
                    href={`/admin/surveys/kairos/${encodeURIComponent(programme.roundId)}/${encodeURIComponent(programme.programmeId)}`}
                    className={styles.link}
                  >
                    {KAIROS_REPORT_WORDS.see}
                  </Link>
                  {end?.over ? (
                    <KairosFileButton roundId={programme.roundId} programmeId={programme.programmeId} />
                  ) : (
                    <p className={styles.muted}>{KAIROS_FILE_WORDS.notOverLine(end?.lastDay ?? null)}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AdminPage>
  );
}
