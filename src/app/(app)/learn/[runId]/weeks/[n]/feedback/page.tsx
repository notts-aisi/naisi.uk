import Link from "next/link";
import { redirect } from "next/navigation";
import InitialsChip from "@/components/ui/InitialsChip";
import { getRunAccess, getSessionUser } from "@/features/courses/runAccess";
import weekly from "@/features/courses/weekly/weekly.module.css";
import ClampedAnswer from "@/features/courses/written/ClampedAnswer";
import styles from "@/features/courses/written/written.module.css";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { isBlockWeek, partsOf } from "@/lib/courses/weekBlocks/model";
import { weekWrittenAnswers } from "@/lib/courses/weekBlocks/reader";
import { answerNameOf, isWordCountedAnswer, readWrittenAnswer } from "@/lib/courses/writtenAnswers/model";
import {
  FEEDBACK,
  NOT_SENT_FEEDBACK_PAGE,
  YOUR_ANSWER,
  commentHeadWords,
  feedbackEyebrowWords,
  feedbackTitleWords,
  fromWords,
  lockedLineWords,
  noFeedbackYetWords,
  noMarksWords,
  sentMetaWords,
} from "@/lib/courses/writtenAnswerWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { exerciseResponseId, isReflectionResponse } from "@/lib/firestore/courseExercises";
import { weekDocId } from "@/lib/firestore/courses";

/**
 * THE FELLOW'S FEEDBACK PAGE (board wk-feedback-phone):
 * `/learn/[runId]/weeks/[n]/feedback`, the link in the "feedback is waiting"
 * email and the week page's "Feedback from Rahul". Their answer as sent,
 * each row's level with its descriptor, the comment, and who gave it. There
 * are no marks, and the page says so. Never "Late".
 *
 * THEIR OWN AND NOBODY ELSE'S: the row read is addressed by the caller's own
 * uid, so the page cannot show anybody else's answer whatever the address
 * says. It opens to somebody taking part (a live place in a group, active
 * or finished) and to a group's facilitator for their own answer; somebody
 * who left is shown only that they left, elsewhere, and is sent home from
 * here. Staff read other people's answers on the review page.
 */

export const dynamic = "force-dynamic";

const MAX_WEEK_NUMBER = 60;

/** The answer's words as paragraphs: one per line written, blank lines dropped. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export default async function FeedbackPage({ params }: { params: Promise<{ runId: string; n: string }> }) {
  const { runId, n } = await params;
  const access = await getRunAccess(runId);
  if (!access) {
    const user = await getSessionUser();
    redirect(user ? "/learn" : "/login");
  }
  const runHome = `/learn/${encodeURIComponent(runId)}`;
  const weekNumber = /^[1-9]\d?$/.test(n) ? Number(n) : NaN;
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER) redirect(runHome);
  const weekHref = `${runHome}/weeks/${weekNumber}`;

  // Their own: a place in a group, or a group they facilitate.
  const facilitated = access.groups.filter((group) =>
    isNamedWithStanding(access.user, "courseGroups.facilitatorUids", group.facilitatorUids),
  );
  const placedGroupId = access.isEnrolled ? (access.enrolment?.groupId ?? null) : null;
  if (!placedGroupId && facilitated.length === 0) redirect(runHome);
  const ownGroupId = placedGroupId ?? (facilitated.length === 1 ? facilitated[0].id : null);

  const db = getAdminDb();
  if (!db) redirect(runHome);
  const weekId = weekDocId(weekNumber);
  const { week } = await resolveWeekDoc(db, runId, ownGroupId, weekId);
  const answer = week && isBlockWeek(week) ? (weekWrittenAnswers(week)[0] ?? null) : null;
  if (!week || !isBlockWeek(week) || !answer) redirect(weekHref);
  const part = partsOf(week.blocks).find((candidate) => candidate.id === answer.partId) ?? null;
  const answerName = answerNameOf(part?.title ?? "");

  const snap = await db.collection("courseExerciseResponses").doc(exerciseResponseId(runId, access.user.uid, weekId, answer.id)).get();
  const data = snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null;
  const record =
    data && !isReflectionResponse(data) && isWordCountedAnswer(data) && data.uid === access.user.uid ? readWrittenAnswer(data) : null;

  // Who gives feedback, for "No feedback yet": the group's facilitators, or
  // the lead and admins for a facilitator's own answer.
  const ownGroup = access.groups.find((group) => group.id === placedGroupId) ?? null;
  const readerUids = facilitated.length > 0 ? [] : (ownGroup?.facilitatorUids ?? []);
  const nameUids = [...new Set([record?.openedByUid ?? "", record?.feedback?.byUid ?? "", ...readerUids].filter(Boolean))];
  const firstNames = new Map<string, string>();
  for (const userSnap of nameUids.length ? await db.getAll(...nameUids.map((uid) => db.collection("users").doc(uid))) : []) {
    if (userSnap.exists) firstNames.set(userSnap.id, firstNameOfUser(userSnap.data() ?? {}) || "Your facilitator");
  }
  const byName = record?.feedback ? (firstNames.get(record.feedback.byUid) ?? "Your facilitator") : "";
  const leadFirstName = facilitated.length > 0 ? ((await runProgrammeOf(db, runId).catch(() => null))?.leadFirstName ?? null) : null;
  const readerNames =
    facilitated.length > 0
      ? [leadFirstName ? `${leadFirstName} and admins` : "Admins"]
      : readerUids.map((uid) => firstNames.get(uid) ?? "").filter(Boolean);

  const bar = (
    <div className={`${weekly.bar} ${styles.phoneBar}`}>
      <div className={weekly.barStart}>
        <Link href={weekHref} className={weekly.back}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          <span>Week {weekNumber}</span>
        </Link>
      </div>
      <div className={weekly.barTitle}>{FEEDBACK}</div>
      <div className={weekly.barEnd} />
    </div>
  );

  const answerText = record ? (record.boxes ? null : paragraphs(record.text)) : null;
  return (
    <div className={styles.feedbackPage}>
      {bar}
      <Link href={weekHref} className={styles.crumb}>
        Week {weekNumber}
      </Link>
      <div>
        <p className={styles.eyebrow}>{feedbackEyebrowWords(weekNumber)}</p>
        <h1 className={styles.title}>{feedbackTitleWords(answerName)}</h1>
      </div>

      {!record?.firstSentAt ? (
        <p className={styles.quiet}>
          {NOT_SENT_FEEDBACK_PAGE}{" "}
          <Link href={weekHref} className={weekly.cardLink}>
            Week {weekNumber}
          </Link>
        </p>
      ) : (
        <>
          {record.feedback ? (
            <>
              <p className={styles.from}>
                <InitialsChip name={byName} uid={record.feedback.byUid} size="sm" />
                <span>{fromWords(byName, record.feedback.sentAt)}</span>
              </p>
              {record.feedback.levels.length > 0 && (
                <div className={styles.levelsCard}>
                  {record.feedback.levels.map((level) => (
                    <div key={level.row} className={styles.levelRow}>
                      <p className={styles.levelRowName}>{level.row}</p>
                      <span className={styles.levelPill}>{level.level}</span>
                      {level.descriptor && <p className={styles.levelRowDescriptor}>{level.descriptor}</p>}
                    </div>
                  ))}
                </div>
              )}
              <p className={styles.quiet}>{noMarksWords(record.feedback.levels.length)}</p>
              {record.feedback.comment && (
                <section className={styles.commentCard} aria-labelledby="feedback-comment">
                  <h2 id="feedback-comment" className={styles.levelRowName}>
                    {commentHeadWords(byName)}
                  </h2>
                  <p className={styles.commentText}>{record.feedback.comment}</p>
                </section>
              )}
            </>
          ) : (
            <p className={styles.quiet}>
              {noFeedbackYetWords(readerNames)}
            </p>
          )}

          <h2 className={styles.sectionTitle}>{YOUR_ANSWER}</h2>
          <p className={styles.quiet}>{sentMetaWords(record.words, record.firstSentAt)}</p>
          {record.openedAt && (
            <p className={styles.quiet}>{lockedLineWords(firstNames.get(record.openedByUid) ?? "Your facilitator", record.openedAt)}</p>
          )}
          <ClampedAnswer>
            <div className={styles.answerBody}>
              {record.boxes
                ? answer.boxes.map((box) => (
                    <div key={box.id} className={styles.answerBox}>
                      <p className={styles.answerBoxLabel}>{box.label}</p>
                      {paragraphs(record.boxes?.[box.id] ?? "").map((line, index) => (
                        <p key={index}>{line}</p>
                      ))}
                    </div>
                  ))
                : (answerText ?? []).map((line, index) => <p key={index}>{line}</p>)}
            </div>
          </ClampedAnswer>
        </>
      )}
    </div>
  );
}
