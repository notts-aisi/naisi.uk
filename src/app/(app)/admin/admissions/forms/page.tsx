import Link from "next/link";
import { Chip } from "@/features/applications/editor/controls";
import { NewFormButton } from "@/features/applications/editor/TermActions";
import shared from "@/features/applications/editor/editor.module.css";
import styles from "@/features/applications/editor/FormHome.module.css";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import { canRunTerm } from "@/lib/applications/access";
import { listFormsForStaff } from "@/lib/applications/editor/load";
import { applicationFormPath } from "@/lib/applications/editor/olderRounds";
import { projectFormForStaff } from "@/lib/applications/editor/views";
import { stageSummaryFor } from "@/lib/applications/lifecycle/view";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * The application forms: one a term.
 *
 * The list is filtered for whoever is looking. An admin sees every form, a
 * lead or a reviewer sees the forms that name them, and somebody the tree's
 * gate admits who is on no form sees an empty page that says so. Only an
 * admin is offered the button that makes one, and the route behind it refuses
 * anybody else.
 */
export default async function ApplicationFormsPage() {
  const user = await requireAdmissionsPage();
  const db = getAdminDb();
  const loaded = db ? await listFormsForStaff(db, user) : [];
  const forms = loaded.map((entry) => ({
    ...projectFormForStaff(entry.form, entry.context),
    // The same reading of where the form is that its own page draws.
    stage: stageSummaryFor(entry.form, entry.context.now),
  }));
  const admin = canRunTerm(user);

  return (
    <ApplicationsRoot className={shared.page}>
      <nav className={shared.crumb} aria-label="Breadcrumb">
        <Link href="/admin/admissions">Admissions</Link>
      </nav>
      <header className={shared.head}>
        <div className={shared.headMain}>
          <div className={shared.titleRow}>
            <h1 className={shared.title}>Application forms</h1>
          </div>
          <p className={shared.lede}>One form a term, for every programme.</p>
        </div>
        {admin && (
          <div className={shared.headActions}>
            <NewFormButton />
          </div>
        )}
      </header>

      {forms.length === 0 ? (
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
        <ul className={styles.forms}>
          {forms.map((form) => (
            <li key={form.id}>
              <Link href={applicationFormPath(form.id)} className={styles.form}>
                <span className={styles.formMain}>
                  <span className={styles.formTitle}>
                    <span className={styles.formName}>{form.label}</span>
                    <Chip
                      tone={form.stage.live || form.stage.stage === "opens-later" ? "live" : "neutral"}
                      dot={form.stage.live}
                    >
                      {form.stage.title}
                    </Chip>
                  </span>
                  <span className={styles.formLine}>
                    {form.opens && form.closes
                      ? `Applications open ${form.opens.day} and close ${form.closes.dayAndTime}.`
                      : "No dates yet."}
                    {form.decisions ? ` Everyone hears on ${form.decisions.day}.` : ""}
                  </span>
                </span>
                <span className={styles.formSide}>
                  {form.programmes.length === 1 ? "1 programme" : `${form.programmes.length} programmes`} ·{" "}
                  {form.sent === 1 ? "1 application sent" : `${form.sent} applications sent`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ApplicationsRoot>
  );
}
