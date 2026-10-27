import Link from "next/link";
import PageHead from "@/components/ui/PageHead";
import { AdminPage } from "@/features/admin/adminList";
import KairosFileButton from "@/features/kairos/KairosFileButton";
import styles from "@/features/kairos/kairos.module.css";
import { loadForm } from "@/lib/applications/repo";
import { getAdminDb } from "@/lib/firebase/admin";
import { kairosProgrammeOf } from "@/lib/kairos/programmes";
import { KAIROS_FILE_WORDS, KAIROS_REPORT_WORDS } from "@/lib/kairos/words";
import { loadKairosReport } from "@/lib/surveys/kairosReportLoad";

export const dynamic = "force-dynamic";

/** A segment that is one id: never a path separator. */
const isPlainId = (value: string) => Boolean(value) && !value.includes("/") && value !== "." && value !== "..";

/**
 * THE KAIROS REPORT FOR ONE PROGRAMME: the questionnaire's fourteen metrics,
 * each figure with its n and the response rate beside it, counterfactual
 * figures labelled self-reported, and a metric the site holds no data for
 * saying what it needs (`src/lib/surveys/kairosReport.ts`). Totals only:
 * never a name. The Kairos file, with names, is the button at the foot.
 *
 * Under `(admin-only)`, so the group's layout (`requireAdminPage()`) is the
 * gate. Read on the server. An address that names no programme is answered
 * on the page in a sentence, never `notFound()`.
 */
export default async function KairosReportPage({ params }: { params: Promise<{ roundId: string; programmeId: string }> }) {
  const { roundId, programmeId } = await params;
  const db = getAdminDb();
  // The round, through the application form's own loader: a round that is
  // not a form, or a programme that names no run, is no programme here.
  const form = db && isPlainId(roundId) ? await loadForm(db, roundId) : null;
  const programme = form && isPlainId(programmeId) ? kairosProgrammeOf(form, programmeId) : null;
  const report = db && programme ? await loadKairosReport(db, programme, new Date()) : null;
  const crumb = <Link href="/admin/surveys/kairos">{KAIROS_REPORT_WORDS.crumb}</Link>;
  if (!programme || !report) {
    return (
      <AdminPage wide>
        <PageHead title={KAIROS_REPORT_WORDS.missingTitle} description={KAIROS_REPORT_WORDS.missing} crumb={crumb} />
      </AdminPage>
    );
  }
  return (
    <AdminPage wide>
      <PageHead title={KAIROS_REPORT_WORDS.title(programme.name)} description={KAIROS_REPORT_WORDS.lede(programme.term)} crumb={crumb} />
      <div className={styles.report}>
        {report.metrics.map((metric) => (
          <section key={metric.id} className={styles.metric} aria-labelledby={`metric-${metric.id}`}>
            <h2 id={`metric-${metric.id}`} className={styles.metricName}>
              {metric.name}
            </h2>
            {metric.figures.length > 0 && (
              <ul className={styles.figures}>
                {metric.figures.map((each) => (
                  <li key={each.label} className={styles.figure}>
                    <span className={styles.figureLabel}>{each.label}</span>
                    <span className={styles.figureValue}>{each.value}</span>
                    {each.selfReported && <span className={styles.tag}>{KAIROS_REPORT_WORDS.selfReported}</span>}
                    <span className={styles.figureN}>{each.n}</span>
                  </li>
                ))}
              </ul>
            )}
            {metric.needs && <p className={styles.line}>{metric.needs}</p>}
            {metric.note && <p className={styles.note}>{metric.note}</p>}
            {metric.links.length > 0 && (
              <ul className={styles.figures}>
                {metric.links.map((link, index) => (
                  <li key={`${index}:${link}`} className={styles.note}>
                    {link}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <section className={styles.metric} aria-label={KAIROS_REPORT_WORDS.howHeading}>
          <h2 className={styles.metricName}>{KAIROS_REPORT_WORDS.howHeading}</h2>
          {report.notes.map((note) => (
            <p key={note} className={styles.note}>
              {note}
            </p>
          ))}
        </section>
        {report.over ? (
          <KairosFileButton roundId={programme.roundId} programmeId={programme.programmeId} />
        ) : (
          <p className={styles.muted}>{KAIROS_FILE_WORDS.notOverLine(report.lastDay)}</p>
        )}
      </div>
    </AdminPage>
  );
}
