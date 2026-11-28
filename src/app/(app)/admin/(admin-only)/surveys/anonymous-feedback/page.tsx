import Link from "next/link";
import PageHead from "@/components/ui/PageHead";
import { AdminPage } from "@/features/admin/adminList";
import AdminFeedback from "@/features/societyFeedback/AdminFeedback";
import styles from "@/features/societyFeedback/societyFeedback.module.css";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPage } from "@/lib/firebase/pageGates";
import { readForAdmins } from "@/lib/societyFeedback/admin";
import { dayOf, yearBefore } from "@/lib/societyFeedback/model";
import { buildAdminView } from "@/lib/societyFeedback/view";
import { ADMIN_WORDS } from "@/lib/societyFeedback/words";

export const dynamic = "force-dynamic";

/**
 * Run NAISI › Surveys › Anonymous feedback: what members sent through the
 * anonymous form, from the day after each was sent, by day, in no particular
 * order within a day, with a filter by programme and by role, Dealt with, a
 * note for admins, a download and the clear-out by hand
 * (docs/surveys.md, "Anonymous feedback for the whole society").
 *
 * The page asks `requireAdminPage()` itself before anything is read, as its
 * `(admin-only)` layout does, and every route it calls asks again. A view-as session's account is never an admin's, and the admin
 * tree is closed during one. A programme's lead, a facilitator, SU-recognised
 * committee and members are sent away before anything is read, so nothing
 * tells them an entry exists.
 *
 * READS PER VIEW: every application form (one query, for when this term
 * began), this term's kept entries (one range on `day`, at most 2,000) and the
 * oldest kept entry (one, ordered by `day`). Never the waiting place.
 */
export default async function AnonymousFeedbackAdminPage() {
  await requireAdminPage();
  const db = getAdminDb();
  const now = new Date();
  const today = dayOf(now);
  const view = db ? await readForAdmins(db, now) : buildAdminView([], today, null);
  return (
    <AdminPage wide>
      <PageHead
        title={ADMIN_WORDS.title}
        crumb={<Link href="/admin/surveys">{ADMIN_WORDS.crumb}</Link>}
        badges={<span className={styles.tag}>{ADMIN_WORDS.adminsOnly}</span>}
        meta={view.countLine ? <span>{view.countLine}</span> : undefined}
        actions={
          <a href="/api/admin/anonymous-feedback/download" download className={styles.download}>
            {ADMIN_WORDS.download}
          </a>
        }
      />
      <AdminFeedback view={view} latestClearDay={yearBefore(today)} />
    </AdminPage>
  );
}
