import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import SurveyFrame from "@/features/aiSurvey/SurveyFrame";
import frame from "@/features/aiSurvey/survey.module.css";
import styles from "@/features/aiSurvey/admin/totals.module.css";
import { surveyAdmin } from "@/lib/aiSurvey/adminStore";
import { AI_SURVEY } from "@/lib/aiSurvey/definition";
import { readAllSets } from "@/lib/aiSurvey/store";
import { share, surveyTotals, type LineTotals } from "@/lib/aiSurvey/totals";

/*
  /ai-survey/admin/totals: the AI at Nottingham survey's totals, for the
  accounts on its own list and nobody else (`surveyAdmin`, the same gate as
  the admin page).

  For each question, how many chose each answer, out of the answer sets that
  saved its page. For each line answered on an agree or support scale, also
  the share in favour and the share against AMONG THOSE WHO GAVE A VIEW:
  "Don't know" and "Don't know enough" sit outside the scale and are left out
  of every share, and the number with a view is beside each share.

  TOTALS ONLY. No answer set, no comment and nothing about one person is on
  this page: comments are read in the download. No floor is applied here; a
  floor belongs on the results page that is published.
*/

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Totals: ${AI_SURVEY.admin.heading}`,
  robots: { index: false, follow: false },
};

const percent = (part: number, whole: number) => {
  const value = share(part, whole);
  return value === null ? "" : `${value}%`;
};

function Lines({ lines, twoSided, favour, against }: { lines: LineTotals[]; twoSided: boolean; favour: string; against: string }) {
  const answers = lines[0]?.counts ?? [];
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Line</th>
            {answers.map((answer) => (
              <th key={answer.id} scope="col" className={styles.num}>
                {answer.label}
              </th>
            ))}
            {twoSided && (
              <>
                <th scope="col" className={styles.num}>
                  With a view
                </th>
                <th scope="col" className={styles.num}>
                  {favour}
                </th>
                <th scope="col" className={styles.num}>
                  {against}
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <th scope="row">
                <span className={styles.code}>{line.id}</span> {line.label}
              </th>
              {line.counts.map((answer) => (
                <td key={answer.id} className={styles.num}>
                  {answer.count}
                </td>
              ))}
              {twoSided && (
                <>
                  <td className={styles.num}>{line.withAView}</td>
                  <td className={`${styles.num} ${styles.strong}`}>{percent(line.inFavour, line.withAView)}</td>
                  <td className={`${styles.num} ${styles.strong}`}>{percent(line.against, line.withAView)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AiSurveyTotalsPage() {
  const { signedIn, admin } = await surveyAdmin();
  if (!signedIn) redirect("/login?next=/ai-survey/admin/totals");
  const words = AI_SURVEY.admin;

  if (!admin) {
    return (
      <SurveyFrame label={words.frameLabel}>
        <main className={frame.column}>
          <h1 className={frame.h1}>{words.heading}</h1>
          <section className={frame.card}>
            <p className={`${frame.body} ${frame.bodyStrong}`}>This page is not open to this account.</p>
          </section>
        </main>
      </SurveyFrame>
    );
  }

  const totals = surveyTotals(await readAllSets(admin.db, admin.state));
  return (
    <SurveyFrame label={words.frameLabel}>
      <main className={`${frame.column} ${frame.wide}`}>
        <div className={frame.stackWide}>
          <h1 className={`${frame.h1} ${frame.h1Thanks}`}>Totals</h1>
          <p className={frame.body}>
            {totals.started} answer sets started, {totals.finished} finished. A count is out of the answer sets that
            saved that page. A share is out of those who gave a view on that line: “Don’t know” and blanks are left
            out.
          </p>
          <Link href="/ai-survey/admin" prefetch={false} className={frame.textLink}>
            Back to the survey’s admin page
          </Link>
        </div>
        {totals.pages.map((page) => (
          <section key={page.id} className={styles.page}>
            <div className={styles.pageHead}>
              <h2 className={styles.h2}>{page.heading}</h2>
              <span className={frame.term}>{page.saved} saved this page</span>
            </div>
            {page.questions.map((question) => {
              if (question.kind === "lines") {
                const agree = question.scale === "agree";
                return (
                  <div key={question.id} className={frame.stack}>
                    {question.text && <h3 className={styles.h3}>{question.text}</h3>}
                    <Lines
                      lines={question.lines}
                      twoSided={question.twoSided}
                      favour={agree ? "Agree" : "Support"}
                      against={agree ? "Disagree" : "Oppose"}
                    />
                  </div>
                );
              }
              if (question.kind === "comments") {
                return (
                  <p key={question.id} className={frame.body}>
                    <span className={styles.code}>{question.id}</span> {question.written} wrote a comment. Comments are
                    read in the download, never here.
                  </p>
                );
              }
              if (question.kind === "tick") {
                return (
                  <p key={question.id} className={frame.body}>
                    <span className={styles.code}>{question.id}</span> {question.ticked} ticked “{question.text}”
                  </p>
                );
              }
              return (
                <div key={question.id} className={frame.stack}>
                  <h3 className={styles.h3}>
                    <span className={styles.code}>{question.id}</span> {question.text}
                  </h3>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th scope="col">Answer</th>
                          <th scope="col" className={styles.num}>
                            Count
                          </th>
                          <th scope="col" className={styles.num}>
                            Of {page.saved}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {question.counts.map((answer) => (
                          <tr key={answer.id}>
                            <th scope="row">{answer.label}</th>
                            <td className={styles.num}>{answer.count}</td>
                            <td className={styles.num}>{percent(answer.count, page.saved)}</td>
                          </tr>
                        ))}
                        <tr>
                          <th scope="row" className={styles.quiet}>
                            {question.multi ? "Ticked none" : "Skipped"}
                          </th>
                          <td className={`${styles.num} ${styles.quiet}`}>{page.saved - question.answered}</td>
                          <td className={`${styles.num} ${styles.quiet}`}>{percent(page.saved - question.answered, page.saved)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
        <p className={frame.small}>{words.neverOnePerson}</p>
      </main>
    </SurveyFrame>
  );
}
