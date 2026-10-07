"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import kit from "@/features/applications/kit/kit.module.css";
import { SU_PAGE_URL } from "@/content/socials";
import type { ApplicationContent, QuestionSetDoc, SuMembershipAnswer } from "@/lib/applications/model";
import { answeredCount } from "@/lib/applications/validate";
import type { ApplicantProgramme } from "@/lib/applications/applicant/types";
import { aboutDetail, aboutHeadline, answersPreview, privacyAgreement } from "./checkText";
import { ChoicePair } from "./fields";
import { setChangeLabel, setStepLabel } from "./steps";
import form from "./form.module.css";
import styles from "./check.module.css";

/**
 * Check and send: everything the person has entered, a section to a row, each
 * with a Change link back to its step. Then the two things asked here (SU
 * membership, and the optional access-requirements box, which is its own
 * component and is saved apart from the application), and what happens to
 * the application once it is sent.
 *
 * The rows come from the same list of steps the person walked through, so a
 * section they were never asked does not appear.
 *
 * WHO READS IT is said in words, above the link to the privacy notice. The
 * sentence says who, and says nothing about what they see of the person: the
 * form does not mention names.
 *
 * SENDING IS AGREEING TO THE PRIVACY POLICY, and the line under that sentence
 * says so, with the policy as a link and the day it was last updated. The
 * day is the policy's own (`privacyAgreement` in `./checkText`) and is typed
 * nowhere on this step.
 */

/** The full "Courses and programmes" section of the privacy notice. */
const PRIVACY_HREF = "/privacy#courses";

const SU_YES = "Yes";
const SU_NOT_YET = "Not yet";

export type CheckIssue = { stepId: string; stepLabel: string; message: string };

export type SentState =
  /** Never sent. */
  | { kind: "none" }
  /** Sent, and the form still shows what was sent. */
  | { kind: "same"; sentLabel: string | null }
  /** Sent, and something has been changed since. */
  | { kind: "changed"; sentLabel: string | null };

function Row({
  label,
  changeLabel,
  href,
  onChange,
  children,
}: {
  label: string;
  /** The link's full name for a screen reader: "Change your availability". */
  changeLabel: string;
  href: string;
  onChange: (event: MouseEvent<HTMLAnchorElement>) => void;
  children: ReactNode;
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        <span className={`${kit.mono} ${styles.rowLabel}`}>{label}</span>
        <a href={href} aria-label={changeLabel} className={styles.change} onClick={onChange}>
          Change
        </a>
      </div>
      <div className={styles.rowBody}>{children}</div>
    </div>
  );
}

export default function CheckStep({
  content,
  ranked,
  asksFacilitating,
  sets,
  optionsOf,
  availabilityLines,
  hrefFor,
  onGo,
  onSuMembership,
  accessRequirements,
  closesLabel,
  issues,
  suProblem,
  sent,
  sendError,
  noticeRef,
}: {
  content: ApplicationContent;
  /** The ticked programmes, in the person's order. */
  ranked: readonly ApplicantProgramme[];
  asksFacilitating: boolean;
  /** The question sets this person is asked, in order. */
  sets: readonly QuestionSetDoc[];
  optionsOf: (setId: string, questionId: string) => readonly string[];
  availabilityLines: readonly string[];
  hrefFor: (stepId: string) => string;
  onGo: (stepId: string) => void;
  onSuMembership: (answer: SuMembershipAnswer) => void;
  /** The access-requirements box (`AccessRequirementsBox`), drawn above who reads the application. */
  accessRequirements: ReactNode;
  closesLabel: string | null;
  /** What still stops a send, shown once the person has pressed Send. */
  issues: readonly CheckIssue[];
  suProblem: string | null;
  sent: SentState;
  sendError: string | null;
  noticeRef: React.Ref<HTMLDivElement>;
}) {
  const go = (stepId: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    // A plain click moves within the page. Anything else (a new tab, say) is
    // the browser's, and the address it opens lands on the same step.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onGo(stepId);
  };
  const orderStep = ranked.length >= 2 ? "rank" : "choose";
  const elsewhere = issues.filter((issue) => issue.stepId !== "check");
  const agreement = privacyAgreement();

  return (
    <div className={form.body}>
      {issues.length > 0 ? (
        <div ref={noticeRef} tabIndex={-1} className={form.notice} data-tone="warn" role="alert">
          <p>A few things to finish before you send.</p>
          <ul>
            {elsewhere.map((issue) => (
              <li key={`${issue.stepId}:${issue.message}`}>
                <a href={hrefFor(issue.stepId)} className={form.inlineLink} onClick={go(issue.stepId)}>
                  {issue.stepLabel}
                </a>
                : {issue.message}
              </li>
            ))}
            {suProblem ? <li>{suProblem}</li> : null}
          </ul>
        </div>
      ) : sendError ? (
        <div ref={noticeRef} tabIndex={-1} className={form.notice} data-tone="warn" role="alert">
          <p>{sendError}</p>
        </div>
      ) : null}

      {sent.kind === "same" ? (
        <div className={form.notice}>
          <p>
            You sent this{sent.sentLabel ? ` on ${sent.sentLabel}` : ""}. Nothing has changed since.
            {closesLabel ? ` You can change your answers until ${closesLabel}.` : ""}
          </p>
        </div>
      ) : null}
      {sent.kind === "changed" ? (
        <div className={form.notice} data-tone="warn">
          <p>
            You’ve changed your answers since you sent this{sent.sentLabel ? ` on ${sent.sentLabel}` : ""}. Send
            it again and we’ll read the new version. Until you do, we have the one you sent.
          </p>
        </div>
      ) : null}

      <div className={styles.summary}>
        <Row label="About you" changeLabel="Change about you" href={hrefFor("about")} onChange={go("about")}>
          {aboutHeadline(content.aboutYou) || <span className={styles.empty}>Not filled in yet</span>}
          {aboutDetail(content.aboutYou) ? (
            <div className={styles.detail}>{aboutDetail(content.aboutYou)}</div>
          ) : null}
        </Row>

        <Row
          label="Your order"
          changeLabel="Change your programmes or their order"
          href={hrefFor(orderStep)}
          onChange={go(orderStep)}
        >
          {ranked.length === 0 ? (
            <span className={styles.empty}>Nothing ticked yet</span>
          ) : (
            <ol className={styles.order}>
              {ranked.map((programme, index) => (
                <li key={programme.id} className={styles.orderItem}>
                  <span className={styles.orderNumber}>{index + 1}</span>
                  <span>{programme.shortName}</span>
                </li>
              ))}
            </ol>
          )}
        </Row>

        {asksFacilitating ? (
          <Row
            label="Facilitating"
            changeLabel="Change your facilitating answer"
            href={hrefFor("facilitating")}
            onChange={go("facilitating")}
          >
            {content.wantsToFacilitate === null ? (
              <span className={styles.empty}>Not answered yet</span>
            ) : content.wantsToFacilitate ? (
              "Yes"
            ) : (
              "Not this time"
            )}
          </Row>
        ) : null}

        {sets.map((set) => {
          const stepId = `set:${set.id}`;
          const preview = answersPreview(set, content, (questionId) => optionsOf(set.id, questionId));
          return (
            <Row
              key={set.id}
              label={setStepLabel(set)}
              changeLabel={`Change your ${setChangeLabel(set)}`}
              href={hrefFor(stepId)}
              onChange={go(stepId)}
            >
              <div>
                {answeredCount(set, content)} of {set.questions.length} answered
              </div>
              {preview ? <div className={styles.preview}>{preview}</div> : null}
            </Row>
          );
        })}

        <Row
          label="Availability"
          changeLabel="Change your availability"
          href={hrefFor("availability")}
          onChange={go("availability")}
        >
          {availabilityLines.length === 0 ? (
            <span className={styles.empty}>No time painted yet</span>
          ) : (
            availabilityLines.map((line) => <div key={line}>{line}</div>)
          )}
        </Row>
      </div>

      <div>
        <ChoicePair
          legend="Do you have SU membership?"
          options={[SU_YES, SU_NOT_YET]}
          value={content.suMembership === "yes" ? SU_YES : content.suMembership === "not-yet" ? SU_NOT_YET : null}
          onChange={(answer) => onSuMembership(answer === SU_YES ? "yes" : "not-yet")}
          error={suProblem}
        />
        <p className={styles.suHelp}>
          We’d like everyone who takes part to get SU membership (£6 a year). It won’t affect your application.{" "}
          <a href={SU_PAGE_URL} target="_blank" rel="noopener noreferrer" className={form.inlineLink}>
            Get it on the SU site
          </a>
        </p>
      </div>
      {accessRequirements}

      <div className={styles.use}>
        {/*
          WHO THIS NAMES IS WHO `canReadApplication` LETS IN
          (src/lib/applications/access.ts) for the programmes a person picks:
          an admin, or somebody with a role, lead or reviewer, on a programme
          in their ranking. It is a promise made to the person sending, so if
          that predicate changes, this sentence changes with it: a test holds
          the two together.
        */}
        <p className={styles.readers}>
          Your application is read by the lead and the reviewers of each programme you pick, and by NAISI’s admins.
        </p>
        <p className={styles.readers}>
          {agreement.before}
          <Link href={agreement.href} className={form.inlineLink}>
            {agreement.link}
          </Link>
          {agreement.after}
        </p>
        <Link href={PRIVACY_HREF} className={form.quietLink}>
          How we use your application
        </Link>
      </div>
    </div>
  );
}
