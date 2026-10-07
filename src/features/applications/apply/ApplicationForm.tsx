"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import kit from "@/features/applications/kit/kit.module.css";
import { columnsToMask, maskToColumns, type DayColumns } from "@/features/admissions/availabilityModel";
import { useHydrated } from "@/hooks/useHydrated";
import type { AboutYou, AnswerValue, ApplicationContent, SuMembershipAnswer } from "@/lib/applications/model";
import { applicableSets, openProgrammes, rankedProgrammes, stepsFor } from "@/lib/applications/sections";
import { contentForSend, issuesFor, optionsFor } from "@/lib/applications/validate";
import { withAccountEmail } from "@/lib/applications/applicant/account";
import { mustVerifyBeforeSending } from "@/lib/applications/applicant/join";
import { own } from "@/lib/applications/applicant/keys";
import { emptyContent, formShapeOf, questionSetsOf, sameContent } from "@/lib/applications/applicant/shape";
import type {
  ApplicantApplication,
  ApplicantForm,
  ApplicantQuestionSet,
} from "@/lib/applications/applicant/types";
import AboutStep from "./AboutStep";
import AccessRequirementsBox from "./AccessRequirementsBox";
import AvailabilityStep from "./AvailabilityStep";
import SentScreen from "@/features/applications/status/SentScreen";
import { useAccessRequirements } from "./useAccessRequirements";
import { waitingSteps } from "@/lib/applications/status/view";
import CheckStep, { type CheckIssue, type SentState } from "./CheckStep";
import ChooseStep from "./ChooseStep";
import FacilitatingStep from "./FacilitatingStep";
import QuestionsStep from "./QuestionsStep";
import RankStep from "./RankStep";
import { UniversityCheckHold, UniversityCheckNote } from "./UniversityCheck";
import { sendApplication, type SendIssue } from "./applyClient";
import { paintedSlots, summaryLines } from "./availabilityText";
import { ArrowRightIcon, BackIcon, CloseIcon, SendIcon, TickIcon } from "./icons";
import {
  STEP_PARAM,
  landingStepIndex,
  progressLine,
  setChip,
  stepHeading,
  stepIndexOf,
  stepLabel,
} from "./steps";
import { forgetAnswers } from "./keptAnswers";
import { useDraftSaver, type SaveState } from "./useDraftSaver";
import { useUniversityCheck } from "./useUniversityCheck";
import styles from "./form.module.css";

/**
 * The form an applicant fills in: one step at a time, saved as they go.
 *
 * ## What decides the steps
 *
 * `stepsFor` (src/lib/applications/sections.ts), and nothing here. The list
 * is worked out again from what the person has entered on every render, so
 * ticking a second programme adds the Rank step and saying yes to
 * facilitating adds the facilitator questions, and "Step 5 of 10" is true for
 * them. What stops a send is `issuesFor`, the same check the server runs.
 *
 * ## One markup, two layouts
 *
 * A laptop gets a left column of this person's sections and Back and Next
 * under the step. A phone gets its own top bar, a progress line and a bar of
 * actions held to the bottom. Both are in the page; `form.module.css` shows
 * one or the other.
 *
 * ## The address follows the step
 *
 * Each step is `?step=<id>`, pushed with the browser's own history, so the
 * back gesture on a phone goes to the previous step instead of out of the
 * form, a reload lands where the person was, and every Change link is a real
 * link.
 *
 * ## Two copies
 *
 * Everything typed is saved to the DRAFT. Sending copies the draft into the
 * application of record. After a send, changes go on being saved to the draft
 * and the form says, on the last step, that they have not been sent yet.
 *
 * ## A university address that is still to be checked
 *
 * An account that is waiting to be approved can fill the whole form in and
 * save it, and cannot SEND it until its owner has followed the link emailed
 * to their university address. The send route is what refuses
 * (`sendHoldFor`). The form says so where it matters, under the address on
 * About you and at the top of the last step, offers to send the link again,
 * and notices by itself when the link has been followed
 * (`useUniversityCheck`).
 */

type Props = {
  form: ApplicantForm;
  sets: ApplicantQuestionSet[];
  application: ApplicantApplication | null;
  /** The About you answers on the person's account. */
  account: AboutYou;
  /** The step the address asked for, if any. */
  initialStep: string | null;
  /** The account is still waiting for the committee to approve it. */
  pending: boolean;
  /** An admin is looking at this as the member. Nothing may be saved. */
  viewingAs: boolean;
};

const HOME = "/";
const LATER = "/applications";

function SaveStatus({ state }: { state: SaveState }) {
  if (state.kind === "saved") {
    return (
      <span role="status" className={styles.status} data-tone="ok">
        <TickIcon />
        Saved
      </span>
    );
  }
  if (state.kind === "saving") {
    return (
      <span role="status" className={styles.status}>
        Saving…
      </span>
    );
  }
  if (state.kind === "failed") {
    return (
      <span role="status" className={styles.status} data-tone="bad">
        Not saved
      </span>
    );
  }
  return <span role="status" className={styles.status} />;
}

function openingContent(
  application: ApplicantApplication | null,
  account: AboutYou,
  form: ApplicantForm,
): ApplicationContent {
  const base = application ? application.draft : emptyContent(account, form.availabilityGrid);
  // The university email is the account's, whatever an older draft held.
  return { ...base, aboutYou: withAccountEmail(base.aboutYou, account) };
}

export default function ApplicationForm({
  form,
  sets,
  application: firstApplication,
  account,
  initialStep,
  pending,
  viewingAs,
}: Props) {
  const router = useRouter();
  const hydrated = useHydrated();
  const shape = useMemo(() => formShapeOf(form), [form]);
  const setDocs = useMemo(() => questionSetsOf(form, sets), [form, sets]);
  const grid = form.availabilityGrid;

  const [content, setContent] = useState<ApplicationContent>(() =>
    openingContent(firstApplication, account, form),
  );
  const contentRef = useRef(content);
  const [application, setApplication] = useState(firstApplication);
  const exists = useRef(firstApplication !== null);
  const adopt = useCallback((latest: ApplicantApplication | null) => {
    if (latest) exists.current = true;
    setApplication(latest);
  }, []);

  const saver = useDraftSaver({
    roundId: form.id,
    enabled: !viewingAs,
    alreadySaved: firstApplication ? JSON.stringify(firstApplication.draft) : null,
    read: () => contentRef.current,
    onSaved: adopt,
  });
  const { changed, flush } = saver;

  const check = useUniversityCheck({
    roundId: form.id,
    address: account.universityEmail,
    preferredName: content.aboutYou.preferredName,
    verified: account.universityEmailVerified,
    // The same rule the send route applies, which is the account's role.
    required: mustVerifyBeforeSending(pending ? "pending" : "member") && !viewingAs,
  });

  // Somebody who reaches the form has a join request, so anything the join
  // step kept in this tab for them has done its job.
  useEffect(() => {
    forgetAnswers(form.id);
  }, [form.id]);

  const update = useCallback(
    (change: (current: ApplicationContent) => ApplicationContent) => {
      const next = change(contentRef.current);
      if (next === contentRef.current) return;
      contentRef.current = next;
      setContent(next);
      changed();
    },
    [changed],
  );

  // The draft carries the account's verified flag (the server writes it on
  // every save). When the link is followed while the form is open, the copy
  // on the screen follows, so what is sent reads as what is on the screen.
  const checked = check.verified;
  useEffect(() => {
    if (!checked || contentRef.current.aboutYou.universityEmailVerified) return;
    update((current) => ({ ...current, aboutYou: { ...current.aboutYou, universityEmailVerified: true } }));
  }, [checked, update]);

  // --- what this person is asked, worked out from what they have entered ---
  const steps = stepsFor(shape, setDocs, content);
  const issues = issuesFor(shape, setDocs, content);
  const asked = applicableSets(shape, setDocs, content);
  const ranked = rankedProgrammes(shape, content);
  const columns = useMemo(() => maskToColumns(content.availability, grid), [content.availability, grid]);
  const hasAvailability = columns.some((column) => paintedSlots(column) > 0);

  // Where the draft itself says this person has got to, and where this visit
  // starts: the step the address names, or failing that the same place.
  const [resume] = useState(() =>
    landingStepIndex(steps, issues, {
      started: firstApplication !== null,
      sent: Boolean(firstApplication?.sent),
      hasAvailability,
    }),
  );
  const [landing] = useState(() => {
    const named = stepIndexOf(steps, initialStep);
    return named !== -1 ? named : resume;
  });
  const [stepId, setStepId] = useState(() => steps[landing]?.id ?? "about");
  const [reached, setReached] = useState(() => Math.max(resume, landing));
  const [attempted, setAttempted] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [serverIssues, setServerIssues] = useState<SendIssue[]>([]);
  const [justSent, setJustSent] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // A step that stopped applying (its programme was unticked) falls back to Choose.
  const found = stepIndexOf(steps, stepId);
  const index = found === -1 ? Math.max(0, stepIndexOf(steps, "choose")) : found;
  const step = steps[index];
  const total = steps.length;
  const label = stepLabel(step, setDocs);
  const isLast = index === total - 1;

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const holdRef = useRef<HTMLDivElement | null>(null);
  const [moved, setMoved] = useState(0);

  const hrefFor = useCallback((id: string) => `?${STEP_PARAM}=${encodeURIComponent(id)}`, []);

  // The step ids as one stable list, so the callbacks below change only when
  // the steps themselves do.
  const stepKey = steps.map((each) => each.id).join("|");
  const stepIds = useMemo(() => stepKey.split("|"), [stepKey]);
  const landingId = steps[landing]?.id ?? "about";

  const show = useCallback(
    (id: string, push: boolean) => {
      const at = stepIds.indexOf(id);
      setStepId(id);
      setJustSent(false);
      if (at >= 0) setReached((most) => Math.max(most, at));
      if (push) {
        const url = new URL(window.location.href);
        url.searchParams.set(STEP_PARAM, id);
        window.history.pushState(null, "", `${url.pathname}${url.search}`);
      }
      setMoved((count) => count + 1);
    },
    [stepIds],
  );

  const goTo = useCallback(
    (id: string) => {
      // Moving on is a moment to save, and the first press of Continue is
      // what turns a visit into an application.
      void flush(false, true);
      show(id, true);
    },
    [flush, show],
  );

  // The browser's own back and forward move between steps.
  useEffect(() => {
    const onPop = () => {
      const named = new URLSearchParams(window.location.search).get(STEP_PARAM);
      show(named && stepIds.includes(named) ? named : landingId, false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [show, stepIds, landingId]);

  // After a move: back to the top, and the new heading takes the focus so a
  // screen reader starts from it.
  useEffect(() => {
    if (moved === 0) return;
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [moved]);

  // --- changes -------------------------------------------------------------
  const setAbout = (patch: Partial<AboutYou>) =>
    update((current) => ({ ...current, aboutYou: { ...current.aboutYou, ...patch } }));

  const toggleProgramme = (id: string) =>
    update((current) => ({
      ...current,
      rankedProgrammeIds: current.rankedProgrammeIds.includes(id)
        ? current.rankedProgrammeIds.filter((each) => each !== id)
        : [...current.rankedProgrammeIds, id],
    }));

  const reorder = (ids: string[]) => update((current) => ({ ...current, rankedProgrammeIds: ids }));

  const setFacilitate = (wants: boolean) => update((current) => ({ ...current, wantsToFacilitate: wants }));

  const answer = (setId: string, questionId: string, value: AnswerValue) =>
    update((current) => ({
      ...current,
      answers: { ...current.answers, [setId]: { ...(own(current.answers, setId) ?? {}), [questionId]: value } },
    }));

  const setAvailability = (next: DayColumns) =>
    update((current) => ({ ...current, availability: columnsToMask(next, grid) }));

  const setSuMembership = (suMembership: SuMembershipAnswer) =>
    update((current) => ({ ...current, suMembership }));

  // The access-requirements box on the last step. Its answer is kept apart
  // from the application, so it is not in `content` and has a save of its own,
  // which saves the draft first: that is what creates the application.
  const access = useAccessRequirements({
    roundId: form.id,
    enabled: !viewingAs,
    saveDraftFirst: () => flush(false, true),
  });

  // --- leaving and sending ---------------------------------------------------
  async function finishLater() {
    if (leaving) return;
    setLeaving(true);
    const saved = await flush();
    // What is in the access-requirements box is saved before leaving, too.
    // When that alone fails, the last step is where the box says so.
    if (saved && !(await access.settle())) {
      setLeaving(false);
      show("check", true);
      return;
    }
    // Nothing to lose when nothing can be saved here at all.
    if (saved || viewingAs) router.push(exists.current ? LATER : HOME);
    else setLeaving(false);
  }

  async function send() {
    if (sending) return;
    setAttempted(true);
    setSendError(null);
    setServerIssues([]);
    if (issues.length > 0) {
      window.requestAnimationFrame(() => noticeRef.current?.focus());
      return;
    }
    if (check.held) {
      // The link may have been followed since this page last asked.
      setSending(true);
      const verified = await check.refresh();
      if (!verified) {
        setSending(false);
        window.requestAnimationFrame(() => holdRef.current?.focus());
        return;
      }
    }
    setSending(true);
    // Saved again whatever this page thinks is stored, so that what is sent
    // is what is on the screen.
    const saved = await flush(false, true, true);
    if (!saved) {
      setSending(false);
      setSendError("We could not save your latest changes, so nothing has been sent. Try again in a moment.");
      return;
    }
    // What is in the access-requirements box is saved before a send, too.
    if (!(await access.settle())) {
      setSending(false);
      setSendError(
        "We could not save what you wrote under Access requirements, so nothing has been sent. Try again in a moment.",
      );
      return;
    }
    const result = await sendApplication(form.id);
    setSending(false);
    if (result.ok) {
      setApplication(result.application);
      setAttempted(false);
      setJustSent(true);
      setMoved((count) => count + 1);
      return;
    }
    setServerIssues(result.issues);
    setSendError(result.error);
    window.requestAnimationFrame(() => noticeRef.current?.focus());
  }

  const back = index > 0 ? steps[index - 1] : null;
  const next = !isLast ? steps[index + 1] : null;

  const intercept = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    goTo(id);
  };

  // --- what the frame shows ---------------------------------------------------
  const stepsWithIssues = new Set(issues.map((issue) => issue.step));
  const stateOf = (at: number): "current" | "done" | "fix" | "todo" => {
    if (at === index) return "current";
    const broken = stepsWithIssues.has(steps[at].id);
    if (attempted && broken) return "fix";
    return at < reached && !broken ? "done" : "todo";
  };
  const done = steps.filter((_, at) => stateOf(at) === "done").length;

  const sentContent = application?.sent ?? null;
  const sentState: SentState = !sentContent
    ? { kind: "none" }
    : sameContent(contentForSend(shape, setDocs, content), sentContent)
      ? { kind: "same", sentLabel: application?.sentLabel ?? null }
      : { kind: "changed", sentLabel: application?.sentLabel ?? null };

  const checkIssues: CheckIssue[] = [
    ...issues.map((issue) => ({
      stepId: issue.step,
      stepLabel: stepLabel(steps.find((each) => each.id === issue.step) ?? step, setDocs),
      message: issue.message,
    })),
    ...serverIssues
      .filter((issue) => !issues.some((local) => local.step === issue.step && local.message === issue.message))
      .map((issue) => ({
        stepId: issue.step,
        stepLabel: stepLabel(steps.find((each) => each.id === issue.step) ?? step, setDocs),
        message: issue.message,
      })),
  ];
  const problemsOn = (id: string) =>
    attempted ? issues.filter((issue) => issue.step === id && issue.questionId === null).map((issue) => issue.message) : [];

  const set = step.kind === "questions" ? setDocs.find((each) => each.id === step.setId) ?? null : null;
  const chip = set ? setChip(set, form.programmes) : null;
  const facilitatorQuestions = setDocs
    .filter((each) => each.scope.type === "facilitating")
    .reduce((count, each) => count + each.questions.length, 0);
  const openCount = openProgrammes(shape).length;
  const title = `Apply · ${form.label}`;
  const progress = Math.round(((index + 1) / total) * 100);
  const primaryBusy = sending || leaving;
  const sendLabel = sentState.kind === "changed" ? "Send again" : sentState.kind === "same" ? "Sent" : "Send application";
  const canSend = sentState.kind !== "same";

  const primary = (className: string) =>
    isLast ? (
      <button
        type="button"
        className={`${kit.primary} ${className}`}
        onClick={send}
        disabled={!hydrated || primaryBusy || viewingAs || !canSend}
      >
        <span>{sending ? "Sending…" : sendLabel}</span>
        {sentState.kind === "same" ? <TickIcon /> : <SendIcon />}
      </button>
    ) : (
      <button
        type="button"
        className={`${kit.primary} ${className}`}
        onClick={() => next && goTo(next.id)}
        disabled={!hydrated || primaryBusy}
      >
        <span className={styles.onPhone}>Continue</span>
        <span className={styles.onLaptop}>Next</span>
        <ArrowRightIcon />
      </button>
    );

  // A send that has just succeeded replaces the whole form, frame and all.
  if (justSent) {
    return (
      <SentScreen
        roundId={form.id}
        steps={waitingSteps(form, {
          sent: application?.sent ?? null,
          sentLabel: application?.sentLabel ?? null,
        })}
        decisionsLabel={form.decisionsLabel}
        closesLabel={form.closesLabel}
      />
    );
  }

  return (
    <div className={`${styles.shell} ${styles.takeover}`}>
      <div className={styles.topBar}>
        <header className={styles.appBar}>
          <div className={styles.appBarSide}>
            {back ? (
              <button type="button" className={styles.iconButton} aria-label="Back" onClick={() => goTo(back.id)}>
                <BackIcon />
              </button>
            ) : (
              <button type="button" className={styles.iconButton} aria-label="Close" onClick={finishLater}>
                <CloseIcon />
              </button>
            )}
          </div>
          <div className={styles.appBarTitle}>{title}</div>
          <div className={styles.appBarSide} data-end="true">
            <SaveStatus state={saver.state} />
          </div>
        </header>
        <div
          role="progressbar"
          aria-label={`Step ${index + 1} of ${total}`}
          aria-valuenow={index + 1}
          aria-valuemin={1}
          aria-valuemax={total}
          className={styles.progress}
        >
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className={styles.columns}>
        <aside className={styles.aside}>
          <div className={styles.asideHead}>
            <div className={`${kit.mono} ${styles.eyebrow}`}>{title}</div>
            <span className={`${kit.mono} ${styles.asideCount}`}>
              {done} of {total} done
            </span>
          </div>
          <nav aria-label="Your application">
            <ol className={styles.sectionList}>
              {steps.map((each, at) => {
                const state = stateOf(at);
                return (
                  <li key={each.id}>
                    <a
                      href={hrefFor(each.id)}
                      className={styles.sectionLink}
                      aria-current={state === "current" ? "step" : undefined}
                      data-state={state}
                      onClick={intercept(each.id)}
                    >
                      <span className={styles.sectionMark}>
                        {state === "done" ? <TickIcon size={14} strokeWidth={2.8} /> : at + 1}
                      </span>
                      <span>{stepLabel(each, setDocs)}</span>
                      {state === "done" ? <span className="visually-hidden">, done</span> : null}
                      {state === "fix" ? <span className="visually-hidden">, something to finish</span> : null}
                    </a>
                  </li>
                );
              })}
            </ol>
          </nav>
          <div className={styles.asideCard}>
            {form.closesLabel ? (
              <p>
                Applications close <strong>{form.closesLabel}</strong>. You can change your answers until then.
              </p>
            ) : null}
            {form.decisionsLabel ? (
              <p>
                Everyone hears on <span className={styles.together}>{form.decisionsLabel}</span>.
              </p>
            ) : null}
          </div>
          <p className={styles.asideHelp}>
            Questions? <a href="mailto:ai-safety@uonsu.com">ai-safety@uonsu.com</a>
          </p>
        </aside>

        <div className={styles.main}>
          <div className={styles.stepRow}>
            <span className={`${kit.mono} ${styles.stepLine}`}>{progressLine(index, total, label)}</span>
            <span className={styles.desktopStatus}>
              <SaveStatus state={saver.state} />
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`Step ${index + 1} of ${total}`}
            aria-valuenow={index + 1}
            aria-valuemin={1}
            aria-valuemax={total}
            className={`${styles.progress} ${styles.desktopProgress}`}
          >
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>

          <div>
            <div className={styles.headingRow}>
              <h1 ref={headingRef} tabIndex={-1} className={styles.heading}>
                {stepHeading(step, setDocs)}
              </h1>
              {chip ? (
                <span className={styles.chip} data-tone={chip.tone}>
                  {chip.text}
                </span>
              ) : null}
            </div>
            {step.kind === "about" ? (
              <>
                <p className={styles.lede}>From your account. Change anything that’s out of date.</p>
                {pending ? (
                  <p className={styles.lede}>
                    Your join request is still with the committee. You can keep applying while they check it. If
                    you get a place, that approves your account.
                  </p>
                ) : null}
              </>
            ) : null}
            {step.kind === "choose" ? (
              <p className={styles.lede}>
                Tick any that interest you.{openCount > 1 ? " You’ll put them in order next." : ""}
              </p>
            ) : null}
            {step.kind === "rank" ? (
              <p className={styles.lede}>
                You’ll get a place on one at most, and we start from your 1st choice.
              </p>
            ) : null}
            {step.kind === "facilitating" ? (
              <p className={styles.lede}>
                We train you and give you the resources. You don’t need any experience.
              </p>
            ) : null}
            {step.kind === "availability" ? (
              <p className={styles.lede}>
                Drag down <span className={styles.onPhone}>the</span>
                <span className={styles.onLaptop}>a</span> day to paint the times you’re free, as much or as
                little as you like. Drag over painted time to clear it.
              </p>
            ) : null}
            {step.kind === "check" ? (
              <p className={styles.lede}>
                {form.closesLabel ? (
                  <>
                    You can change your answers until <span className={styles.together}>{form.closesLabel}</span>.
                  </>
                ) : (
                  "You can change your answers until applications close."
                )}
              </p>
            ) : null}
          </div>

          {viewingAs ? (
            <div className={styles.notice} data-tone="warn">
              <p>You’re viewing this as the member. Nothing you change here is saved.</p>
            </div>
          ) : null}
          {saver.state.kind === "failed" ? (
            <div className={styles.notice} data-tone="warn" role="alert">
              <p>
                {saver.state.message}{" "}
                {saver.state.final
                  ? "What you’ve typed is still on this screen."
                  : "What you’ve typed is still on this screen, and we’ll keep trying."}
              </p>
              {saver.state.status === 401 ? (
                <p>
                  <Link
                    href={`/login?next=${encodeURIComponent(`/apply/${form.id}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.inlineLink}
                  >
                    Sign in again in a new tab
                  </Link>
                  , then come back and reload this page.
                </p>
              ) : null}
            </div>
          ) : null}

          {step.kind === "about" ? (
            <AboutStep
              key="about"
              about={content.aboutYou}
              email={{
                kind: "account",
                address: account.universityEmail,
                verified: check.verified,
                profileHref: pending ? null : "/profile",
                check: check.held ? <UniversityCheckNote check={check} /> : null,
              }}
              onChange={setAbout}
              problems={problemsOn("about")}
            />
          ) : null}
          {step.kind === "choose" ? (
            <ChooseStep
              programmes={form.programmes}
              ranked={content.rankedProgrammeIds}
              onToggle={toggleProgramme}
              problems={problemsOn("choose")}
            />
          ) : null}
          {step.kind === "rank" ? (
            <RankStep
              programmes={ranked.map((programme) => form.programmes.find((each) => each.id === programme.id)!)}
              onReorder={reorder}
            />
          ) : null}
          {step.kind === "facilitating" ? (
            <FacilitatingStep
              value={content.wantsToFacilitate}
              onChange={setFacilitate}
              moreQuestions={facilitatorQuestions}
              problem={problemsOn("facilitating")[0] ?? null}
            />
          ) : null}
          {set ? (
            <QuestionsStep
              key={set.id}
              set={set}
              answers={own(content.answers, set.id) ?? {}}
              optionsOf={(questionId) => {
                const question = set.questions.find((each) => each.id === questionId);
                return question ? optionsFor(question, shape, content) : [];
              }}
              onAnswer={(questionId, value) => answer(set.id, questionId, value)}
              showProblems={attempted}
            />
          ) : null}
          {step.kind === "availability" ? (
            <AvailabilityStep grid={grid} columns={columns} onChange={setAvailability} />
          ) : null}
          {step.kind === "check" ? (
            <CheckStep
              content={content}
              ranked={ranked.map((programme) => form.programmes.find((each) => each.id === programme.id)!)}
              asksFacilitating={form.asksFacilitating}
              sets={asked}
              optionsOf={(setId, questionId) => {
                const question = setDocs
                  .find((each) => each.id === setId)
                  ?.questions.find((each) => each.id === questionId);
                return question ? optionsFor(question, shape, content) : [];
              }}
              availabilityLines={summaryLines(columns, grid)}
              hrefFor={hrefFor}
              onGo={goTo}
              onSuMembership={setSuMembership}
              accessRequirements={<AccessRequirementsBox access={access} />}
              closesLabel={form.closesLabel}
              issues={attempted ? checkIssues : []}
              suProblem={attempted ? (issues.find((issue) => issue.step === "check")?.message ?? null) : null}
              sent={sentState}
              sendError={sendError}
              noticeRef={noticeRef}
              hold={check.held ? <UniversityCheckHold check={check} noticeRef={holdRef} /> : null}
            />
          ) : null}

          <div className={styles.desktopNav}>
            {back ? (
              <button type="button" className={styles.ghost} onClick={() => goTo(back.id)} disabled={!hydrated}>
                <BackIcon />
                <span>Back</span>
              </button>
            ) : (
              <span className={styles.navSpacer} />
            )}
            {primary(styles.next)}
          </div>
        </div>
      </div>

      <div className={styles.bottomBar}>
        <div className={styles.bottomActions}>
          <button type="button" className={styles.finishLater} onClick={finishLater} disabled={!hydrated || leaving}>
            Finish later
          </button>
          {primary(styles.continue)}
        </div>
      </div>
    </div>
  );
}
