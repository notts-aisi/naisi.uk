import Link from "next/link";
import { getAdminDb } from "@/lib/firebase/admin";
import { AdminPage } from "@/features/admin/adminList";
import { AdminProblem, AdminSection } from "@/features/admin/adminPanels";
import { ensureTemplatesSeeded } from "@/features/admin/emailDesigns/seedTemplates";
import Badge from "@/components/ui/Badge";
import PageHead from "@/components/ui/PageHead";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import {
  DEFAULT_LABELS,
  RECIPIENT_MODIFIER_LABELS,
  TEMPLATE_IDS,
  normalizeTemplate,
  type TemplateDoc,
  type TemplateId,
} from "@/lib/firestore/applicationEmails";
import {
  COURSE_DEFAULT_LABELS,
  COURSE_TEMPLATE_IDS,
  COURSE_TEMPLATE_TRIGGER,
  courseTemplateDefaults,
  normalizeCourseTemplate,
  type CourseTemplateDoc,
  type CourseTemplateId,
  type CourseTemplateTrigger,
} from "@/lib/firestore/courseEmails";
import styles from "@/features/admin/emailDesigns/EmailDesignsList.module.css";

export const dynamic = "force-dynamic";

// Rendered on the server, so the zone and the locale are named and not left
// to the container, which is UTC and en-US.
function formatEdited(date: Date): string {
  return formatSiteDate(date, { day: "numeric", month: "short", year: "numeric" });
}

/** The head every state of this page is drawn under. */
function Head() {
  return (
    <PageHead
      crumb="Site settings"
      title="Sign-up emails"
      description="The emails the site sends by itself when somebody asks to join and when their request is decided, and the ones that go to people applying to a programme or taking part in one."
    />
  );
}

export default async function EmailDesignsPage() {
  const db = getAdminDb();
  if (!db) {
    return (
      <AdminPage wide>
        <Head />
        <AdminProblem>Firebase Admin is not configured on this environment.</AdminProblem>
      </AdminPage>
    );
  }

  await ensureTemplatesSeeded(db);

  const [snap, courseSnap] = await Promise.all([
    db.collection("applicationEmailTemplates").get(),
    db.collection("courseEmailTemplates").get(),
  ]);
  const byId = new Map<TemplateId, TemplateDoc>();
  for (const doc of snap.docs) {
    const tpl = normalizeTemplate(doc.id, doc.data());
    if (tpl) byId.set(tpl.templateId, tpl);
  }

  // Course templates are deliberately NOT seeded: the send path is
  // fallback-first (courseApplicationEmails.ts uses `courseTemplateDefaults`
  // when the doc is missing, malformed, or empty), so an unedited template is a
  // normal steady state rather than a gap to fill in.
  const courseById = new Map<CourseTemplateId, CourseTemplateDoc>();
  for (const doc of courseSnap.docs) {
    const tpl = normalizeCourseTemplate(doc.id, doc.data());
    if (tpl) courseById.set(tpl.templateId, tpl);
  }

  const ordered: TemplateDoc[] = TEMPLATE_IDS.map(
    (id) =>
      byId.get(id) ?? {
        templateId: id,
        trigger: "submitted" as const,
        label: DEFAULT_LABELS[id],
        subject: "",
        blocks: [],
        recipients: "both" as const,
      },
  );

  const submitted = ordered.filter((t) => t.trigger === "submitted");
  const approved = ordered.filter((t) => t.trigger === "approved");
  const rejected = ordered.filter((t) => t.trigger === "rejected");

  return (
    <AdminPage wide>
      <Head />
      <div className={styles.page}>
        <Group heading="When a join request is sent" templates={submitted} />
        <Group heading="When a join request is approved" templates={approved} />
        <Group
          heading="When a join request is turned down"
          description="One email for each reason. The admin picks the reason when they turn the request down."
          templates={rejected}
        />
        <CourseGroup byId={courseById} />
      </div>
    </AdminPage>
  );
}

const COURSE_TRIGGER_LABELS: Record<CourseTemplateTrigger, string> = {
  submitted: "On apply",
  accepted: "On accept",
  waitlisted: "On waitlist",
  rejected: "On reject",
  allocated: "On placement",
  "week-nudge": "Each week",
  "dropped-out": "On leaving",
  "admissions-submitted": "On submitting",
  "admissions-reinstated": "On reopening",
  "admissions-deadline-reminder": "Before the deadline",
  "admissions-stage-released": "On releasing questions",
  "admissions-appointed": "On appointment",
  "admissions-declined": "On declining a facilitator",
};

function CourseGroup({ byId }: { byId: Map<CourseTemplateId, CourseTemplateDoc> }) {
  return (
    <AdminSection
      title="Course and application emails"
      description="Sent to people applying to an admissions round, and to learners across a course run. Any email you have not edited sends NAISI's default wording: nothing is broken until you touch it, and you can always reset back."
    >
      <ul className={styles.list}>
        {COURSE_TEMPLATE_IDS.map((id) => {
          const stored = byId.get(id);
          const subject = stored?.subject || courseTemplateDefaults[id].subject;
          return (
            <li key={id}>
              <Link href={`/admin/email-designs/course/${id}`} className={styles.row}>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{stored?.label || COURSE_DEFAULT_LABELS[id]}</span>
                  <span className={styles.rowSubject}>{subject}</span>
                </span>
                <span className={styles.rowMeta}>
                  <Badge tone={stored ? "accent" : "neutral"}>
                    {COURSE_TRIGGER_LABELS[COURSE_TEMPLATE_TRIGGER[id]]}
                  </Badge>
                  <span className={styles.rowWhen}>
                    {stored?.updatedAt ? `Edited ${formatEdited(stored.updatedAt)}` : "Using defaults"}
                  </span>
                </span>
                <Chevron />
              </Link>
            </li>
          );
        })}
      </ul>
    </AdminSection>
  );
}

function Group({
  heading,
  description,
  templates,
}: {
  heading: string;
  description?: string;
  templates: TemplateDoc[];
}) {
  if (templates.length === 0) return null;
  return (
    <AdminSection title={heading} description={description}>
      <ul className={styles.list}>
        {templates.map((t) => (
          <li key={t.templateId}>
            <Link href={`/admin/email-designs/${t.templateId}`} className={styles.row}>
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>{t.label}</span>
                <span className={styles.rowSubject}>{t.subject || "(no subject set)"}</span>
              </span>
              <span className={styles.rowMeta}>
                <Badge tone="neutral">Sends to: {RECIPIENT_MODIFIER_LABELS[t.recipients]}</Badge>
                {t.updatedAt ? (
                  <span className={styles.rowWhen}>Edited {formatEdited(t.updatedAt)}</span>
                ) : null}
              </span>
              <Chevron />
            </Link>
          </li>
        ))}
      </ul>
    </AdminSection>
  );
}

/** The mark at the end of a row that opens something. */
function Chevron() {
  return (
    <svg
      className={styles.chevron}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
