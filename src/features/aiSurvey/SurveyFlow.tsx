"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { RECAPTCHA_ENABLED, RecaptchaInvisible, type RecaptchaHandle } from "@/components/ui/RecaptchaInvisible";
import { useHydrated } from "@/hooks/useHydrated";
import { normaliseCode, normaliseUniversityAddress } from "@/lib/aiSurvey/address";
import { own } from "@/lib/applications/keys";
import { callSurvey } from "./api";
import { forgetPass, keepPass, keptPass } from "./keptPass";
import { sequenceOf, type PublicSurvey } from "./publicSurvey";
import { PageOfQuestions, type PageAnswers } from "./Questions";
import styles from "./survey.module.css";

/**
 * The AI at Nottingham survey, from the start screen to "Thank you".
 *
 * One component and one address. The start screen is in the first HTML that
 * arrives, so somebody who scanned a code on a bad signal reads it before any
 * script runs; everything after it needs the script, because everything after
 * it is a conversation with the server.
 *
 * WHAT THIS PAGE HOLDS, AND WHERE:
 *  - the address somebody types: in this component's memory, for the two
 *    steps of the email check, and nowhere else. Never in storage.
 *  - the pass: in memory, and in the browser's storage (keptPass.ts) so a
 *    closed tab can be come back to.
 *  - answers: in memory only, for this sitting, so Back works. They are NEVER
 *    put in storage and never asked back from the server, so after coming
 *    back, pages saved earlier stay closed: on a shared computer the next
 *    person must not see the last person's.
 *
 * Nothing slides or fades.
 */

type Step =
  | { at: "start" }
  | { at: "declined" }
  | { at: "comingBack" }
  | { at: "address" }
  | { at: "code" }
  | { at: "already" }
  | { at: "in" }
  | { at: "page"; index: number }
  | { at: "end" }
  | { at: "closed" };

type Session = { pass: string; order: string[]; savedPages: string[] };

function ErrorLine({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} role="alert" className={styles.error}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4.5v4.2M8 10.9v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

/**
 * A whole number below `n`, each equally likely, from the browser's own
 * random source. A draw from the top of the range, where a remainder would
 * make the low numbers likelier, is thrown away and drawn again.
 */
function randomBelow(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const draw = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(draw);
    if (draw[0] < limit) return draw[0] % n;
  }
}

/**
 * 32 random bytes, written as 64 hex characters, made in this browser and
 * kept in this page's memory only. The pass is made from it on the server, so if the answer to
 * "Check my code" is lost on the way, asking again with the same code and the
 * same value gets the same pass, and nobody is shut out by a bad signal.
 */
function newClaim(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // Two hex characters for each byte, whole: nothing is folded onto a smaller alphabet.
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Where to find help: a list that stays closed until it is asked for, and
 * opens without script. Each link opens in a new tab and says nothing about
 * where the person came from.
 */
function Support({ support }: { support: PublicSurvey["support"] }) {
  return (
    <details className={styles.support}>
      <summary>{support.heading}</summary>
      <ul className={styles.supportList}>
        {support.links.map((link) => (
          <li key={link.href}>
            <a href={link.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
              {link.label}
            </a>
            {link.note && <span>{link.note}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The mark left on the address for the one reload after the email check. Never sent anywhere. */
const JUST_IN = "#in";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** One try at checking a code is given up after this long, so there is time to try again. */
const CODE_CHECK_LIMIT_MS = 10_000;
/** How long the page goes on asking again when a code check gets no answer. */
const CODE_CHECK_PATIENCE_MS = 25_000;

/** A fair shuffle: every order of the lines is as likely as any other. */
function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function SurveyFlow({ survey, closed }: { survey: PublicSurvey; closed: boolean }) {
  const hydrated = useHydrated();
  const words = survey.emailCheck;
  const [step, setStep] = useState<Step>(closed ? { at: "closed" } : { at: "start" });
  const [session, setSession] = useState<Session | null>(null);
  /** Where Back stops: the first page of this sitting. */
  const [floor, setFloor] = useState(0);
  const [answers, setAnswers] = useState<Record<string, PageAnswers>>({});
  const [lineOrders, setLineOrders] = useState<Record<string, string[]>>({});

  const [ticked, setTicked] = useState(false);
  const tickRefs = useRef<Record<string, HTMLInputElement | null>>({});
  /** The consent question's answer. Held for this screen only: it is never sent and never stored. */
  const [consent, setConsent] = useState<"yes" | "no" | null>(null);
  const consentRefs = useRef<{ yes: HTMLInputElement | null; no: HTMLInputElement | null }>({ yes: null, no: null });
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [ended, setEnded] = useState(false);

  const recaptcha = useRef<RecaptchaHandle>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const claim = useRef<string | null>(null);

  const go = useCallback((next: Step) => {
    setFieldError(null);
    setSaveFailed(false);
    setStep(next);
  }, []);

  // Each new screen starts at its top, with its heading focused so a screen
  // reader says where it is. Not on first load: the page should open as any
  // page does.
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  // The two ticks are real, unmanaged boxes, so one ticked before the script
  // arrived is still ticked: read them rather than reset them.
  const readTicks = useCallback(() => {
    setTicked(survey.start.ticks.every((tick) => tickRefs.current[tick.id]?.checked === true));
  }, [survey.start.ticks]);
  // The consent question is two real, unmanaged radio buttons for the same reason.
  const readConsent = useCallback(() => {
    setConsent(consentRefs.current.yes?.checked ? "yes" : consentRefs.current.no?.checked ? "no" : null);
  }, []);
  useEffect(() => {
    readTicks();
    readConsent();
  }, [readTicks, readConsent]);

  // Coming back: is there a pass in this browser, and does it still work?
  useEffect(() => {
    if (closed) return;
    // The mark the page leaves on its own address for the one reload after
    // the email check. It is taken off again as soon as it has been read, by a
    // real change of the address's fragment, so the start screen it was
    // hiding (survey.module.css, `.justIn`) is shown again if it has to be.
    const justIn = window.location.hash === JUST_IN;
    const clearMark = () => {
      if (!justIn) return;
      window.location.hash = "";
      window.history.replaceState(null, "", window.location.href.split("#")[0]);
    };
    const pass = keptPass();
    if (!pass) {
      clearMark();
      return;
    }
    let cancelled = false;
    void callSurvey<{ pass: string; order: string[]; savedPages: string[] }>("session", { pass }).then((reply) => {
      if (cancelled) return;
      if (reply.ok) {
        setSession({ pass: reply.pass, order: reply.order, savedPages: reply.savedPages });
        // Straight after the email check the page reloads itself once (see
        // onCode), and comes back here with nothing saved yet: "You're in".
        // Any other time a pass is found, somebody is coming back.
        setStep(justIn && reply.savedPages.length === 0 ? { at: "in" } : { at: "comingBack" });
      } else if (reply.error === "gone" || reply.error === "closed") {
        forgetPass();
        if (reply.error === "closed") setStep({ at: "closed" });
      }
      clearMark();
    });
    return () => {
      cancelled = true;
    };
  }, [closed]);

  const sequence = session ? sequenceOf(survey.pages, session.order) : [];

  const sendCode = async () => {
    if (busy) return false;
    const typed = normaliseUniversityAddress(address);
    if (!typed) {
      setFieldError(words.errors.notUniversityAddress);
      return false;
    }
    setBusy(true);
    setFieldError(null);
    const recaptchaToken = RECAPTCHA_ENABLED ? ((await recaptcha.current?.execute()) ?? null) : null;
    if (RECAPTCHA_ENABLED && !recaptchaToken) {
      setBusy(false);
      setFieldError(words.errors.botCheckFailed);
      return false;
    }
    const reply = await callSurvey<Record<string, never>>("code", { email: typed, recaptchaToken });
    setBusy(false);
    if (reply.ok) return true;
    if (reply.error === "closed") {
      go({ at: "closed" });
      return false;
    }
    const known = words.errors as Record<string, string>;
    setFieldError(known[reply.error] ?? words.errors.couldNotSend);
    return false;
  };

  const onAddress = async (event: FormEvent) => {
    event.preventDefault();
    if (await sendCode()) {
      setCode("");
      go({ at: "code" });
    }
  };

  const onCode = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const typed = normaliseUniversityAddress(address);
    const digits = normaliseCode(code);
    if (!typed || !digits) {
      setFieldError(words.errors.wrongCode);
      return;
    }
    setBusy(true);
    setFieldError(null);
    // One value for this page's whole email check, so that asking again is
    // asking as the same person.
    claim.current ??= newClaim();
    const body = { email: typed, code: digits, claim: claim.current };
    const check = () => callSurvey<{ pass: string; order: string[] }>("code/check", body, CODE_CHECK_LIMIT_MS);
    let reply = await check();
    // "failed" is the network or the server not answering, never a wrong
    // code. The right code may already have been taken, so ask again rather
    // than leave somebody with a used address and no way in: a little longer
    // apart each time, for about half a minute in all.
    const until = Date.now() + CODE_CHECK_PATIENCE_MS;
    for (let again = 1; !reply.ok && reply.error === "failed" && Date.now() < until; again++) {
      await pause(again * 1000);
      reply = await check();
    }
    if (reply.ok) {
      // The address has done its one job. Drop it from the page's memory.
      setAddress("");
      setCode("");
      if (keepPass(reply.pass)) {
        // RELOAD, once. The bot check's script was loaded for the email step
        // and a page cannot unload a script: a fresh page is the only way the
        // questions are answered with nothing of anybody else's running. The
        // pass is kept, so the fresh page finds it and says "You're in".
        window.location.hash = JUST_IN;
        window.location.reload();
        return;
      }
      // Storage refused (a private window): carry on in this page.
      setBusy(false);
      setSession({ pass: reply.pass, order: reply.order, savedPages: [] });
      setFloor(0);
      setAnswers({});
      go({ at: "in" });
      return;
    }
    setBusy(false);
    if (reply.error === "alreadyAnswered") {
      setAddress("");
      setCode("");
      go({ at: "already" });
    } else if (reply.error === "closed") {
      go({ at: "closed" });
    } else {
      // No answer at all is the connection, and is said so: "that code
      // doesn't match" would send somebody back to their email for nothing.
      const known = words.errors as Record<string, string>;
      setFieldError(reply.error === "failed" ? words.errors.couldNotCheck : (known[reply.error] ?? words.errors.wrongCode));
    }
  };

  /** Show a page, deciding the order of its lines the first time it is shown this sitting. */
  const showPage = (index: number, order: string[]) => {
    const pageId = sequenceOf(survey.pages, order)[index];
    const page = survey.pages.find((p) => p.id === pageId);
    if (page) {
      setLineOrders((current) => {
        const next = { ...current };
        for (const question of page.questions) {
          if (question.type === "lines" && !next[question.id]) {
            const ids = question.lines.map((line) => line.id);
            next[question.id] = question.shuffle ? shuffle(ids) : ids;
          }
        }
        return next;
      });
    }
    go({ at: "page", index });
  };

  const carryOn = () => {
    if (!session) return;
    const order = sequenceOf(survey.pages, session.order);
    const next = order.findIndex((id) => !session.savedPages.includes(id));
    const index = next === -1 ? order.length - 1 : next;
    // Pages saved before this sitting stay closed: Back stops here.
    setFloor(index);
    showPage(index, session.order);
  };

  const startOwn = () => {
    forgetPass();
    setSession(null);
    setAnswers({});
    go({ at: "start" });
  };

  /** Back from "you chose not to take part": the start screen is drawn afresh, nothing ticked. */
  const backToStart = () => {
    setTicked(false);
    setConsent(null);
    go({ at: "start" });
  };

  const save = async (index: number) => {
    if (!session || busy) return;
    const pageId = sequence[index];
    const last = index === sequence.length - 1;
    setBusy(true);
    setSaveFailed(false);
    const reply = await callSurvey<{ pass: string; finished: boolean }>("save", {
      pass: session.pass,
      pageId,
      answers: own(answers, pageId) ?? {},
      finish: last,
    });
    setBusy(false);
    if (!reply.ok) {
      if (reply.error === "closed") {
        forgetPass();
        go({ at: "closed" });
        return;
      }
      if (reply.error === "gone") {
        // This browser's unfinished survey is over (a day since its last
        // save, or finished in another tab): trying again cannot help, so
        // the page says so, and the key that no longer works is not kept.
        forgetPass();
        setEnded(true);
        return;
      }
      // The page keeps its answers, and Next becomes Try again.
      setSaveFailed(true);
      return;
    }
    if (last) {
      // Finished: the answer set is locked, and this browser keeps nothing.
      forgetPass();
      setSession(null);
      setAnswers({});
      go({ at: "end" });
      return;
    }
    keepPass(reply.pass);
    setSession({ ...session, pass: reply.pass, savedPages: [...new Set([...session.savedPages, pageId])] });
    showPage(index + 1, session.order);
  };

  const bar = (
    <div className={styles.stack}>
      <p className={styles.eyebrow}>{survey.start.eyebrow}</p>
      <h1 ref={heading} tabIndex={-1} className={styles.h1}>
        {survey.title}
      </h1>
    </div>
  );

  if (step.at === "closed") {
    return (
      <main className={styles.column}>
        {bar}
        <section className={styles.card}>
          <p className={`${styles.body} ${styles.bodyStrong}`}>{survey.start.closed}</p>
        </section>
      </main>
    );
  }

  // "No" to consent is a complete answer: it leads to the closing screen. To
  // start, both boxes are ticked and consent is given.
  const canStart = consent === "no" || (ticked && consent === "yes");

  if (step.at === "start") {
    return (
      <main className={styles.column}>
        {/* For the one reload after the email check: while the address ends
            #in, this is its target, and the start screen after it is hidden,
            so nobody who has just got in is shown "Start" again while the
            page finds their pass. No script is needed for that. */}
        <span id="in" aria-hidden="true" className={styles.justIn} />
        <div className={styles.startBody}>
        {bar}
        <div className={styles.stackWide}>
          <p className={styles.body}>{survey.start.intro}</p>
          <p className={`${styles.body} ${styles.bodyStrong}`}>{survey.start.time}</p>
          <p className={styles.small}>{survey.start.organiser}</p>
        </div>
        <section className={styles.answersCard}>
          <h2 className={styles.answersHeading}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
              <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            {survey.start.yourAnswersHeading}
          </h2>
          <ul className={styles.answersList}>
            {survey.start.yourAnswers.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className={styles.answersLink}>
            <Link href="/ai-survey/privacy" prefetch={false}>
              {survey.start.privacyLink}
            </Link>
          </p>
        </section>
        <div className={styles.ticks}>
          {survey.start.ticks.map((tick) => (
            <label key={tick.id} htmlFor={`tick-${tick.id}`} className={styles.tick}>
              <span className={styles.tickBox}>
                <input
                  id={`tick-${tick.id}`}
                  type="checkbox"
                  ref={(node) => {
                    tickRefs.current[tick.id] = node;
                  }}
                  onChange={readTicks}
                />
                <span aria-hidden="true" className={styles.tickFace}>
                  <svg width="12" height="12" viewBox="0 0 12 12">
                    <path d="M2 6.2 4.8 9 10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </span>
              <span>{tick.label}</span>
            </label>
          ))}
        </div>
        {/* In a block of its own: a fieldset must not be an item of a flex column (Questions.tsx). */}
        <div className={styles.block}>
          <fieldset className={styles.question}>
            <legend className={styles.legend}>
              <span className={styles.title}>{survey.start.consent.heading}</span>
            </legend>
            <p className={styles.body}>{survey.start.consent.asks}</p>
            <ul className={styles.consentPoints}>
              {survey.start.consent.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <div className={styles.options}>
              {(["yes", "no"] as const).map((answer) => (
                <label key={answer} className={styles.option}>
                  <input
                    type="radio"
                    name="consent"
                    value={answer}
                    ref={(node) => {
                      consentRefs.current[answer] = node;
                    }}
                    onChange={readConsent}
                  />
                  <span aria-hidden="true" className={styles.radio} />
                  <span>{survey.start.consent[answer]}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <Support support={survey.support} />
        <div className={styles.stack}>
          <button
            type="button"
            className={`${styles.primary} ${styles.full}`}
            disabled={!hydrated || !canStart}
            aria-describedby="ticks-needed"
            onClick={() => go(consent === "no" ? { at: "declined" } : { at: "address" })}
          >
            {consent === "no" ? survey.start.consent.noButton : survey.start.button}
          </button>
          {/* Until both boxes are ticked and consent is given. Neither is stored. */}
          {!canStart && (
            <p id="ticks-needed" className={styles.small}>
              {survey.start.ticksNeeded}
            </p>
          )}
        </div>
        </div>
      </main>
    );
  }

  if (step.at === "declined") {
    const declined = survey.start.consent.declined;
    return (
      <main className={styles.column}>
        <div className={styles.stackWide}>
          <h1 ref={heading} tabIndex={-1} className={`${styles.h1} ${styles.h1Thanks}`}>
            {declined.heading}
          </h1>
          <p className={`${styles.body} ${styles.bodyStrong}`}>{declined.body}</p>
        </div>
        <Support support={survey.support} />
        <button type="button" className={`${styles.secondary} ${styles.full}`} onClick={backToStart}>
          {declined.back}
        </button>
      </main>
    );
  }

  if (step.at === "comingBack") {
    return (
      <main className={styles.column}>
        <div className={styles.stack}>
          <p className={styles.eyebrow}>{survey.start.eyebrow}</p>
          <h1 ref={heading} tabIndex={-1} className={styles.h1}>
            {survey.start.comingBack.heading}
          </h1>
        </div>
        <p className={`${styles.body} ${styles.bodyStrong}`}>{survey.start.comingBack.body}</p>
        <div className={styles.stackWide}>
          <button type="button" className={`${styles.primary} ${styles.full}`} onClick={carryOn}>
            {survey.start.comingBack.carryOn}
          </button>
          <button type="button" className={`${styles.secondary} ${styles.full}`} onClick={startOwn}>
            {survey.start.comingBack.startOwn}
          </button>
        </div>
      </main>
    );
  }

  if (step.at === "address" || step.at === "code" || step.at === "already") {
    const stepHead = (
      <div className={styles.stack}>
        <p className={styles.eyebrow}>{step.at === "address" ? words.stepAddress : words.stepCode}</p>
        <h1 ref={heading} tabIndex={-1} className={`${styles.h1} ${styles.h1Step}`}>
          {words.heading}
        </h1>
      </div>
    );
    return (
      <main className={styles.column}>
        {stepHead}
        {step.at === "address" && (
          <form className={styles.form} onSubmit={onAddress} noValidate>
            <div className={styles.field}>
              <label htmlFor="email" className={styles.fieldLabel}>
                {words.fieldLabel}
              </label>
              <p id="email-help" className={styles.small}>
                {words.fieldHelp}
              </p>
              <input
                id="email"
                className={styles.input}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                aria-invalid={fieldError ? "true" : "false"}
                aria-describedby={fieldError ? "email-help email-err" : "email-help"}
              />
              {fieldError && <ErrorLine id="email-err">{fieldError}</ErrorLine>}
            </div>
            <button type="submit" className={`${styles.primary} ${styles.full}`} disabled={busy} data-busy={busy || undefined}>
              {words.sendButton}
            </button>
            <RecaptchaLine />
          </form>
        )}
        {step.at === "code" && (
          <form className={styles.form} onSubmit={onCode} noValidate>
            <p className={styles.info}>{words.codeSent}</p>
            <div className={styles.field}>
              <label htmlFor="code" className={styles.fieldLabel}>
                {words.codeFieldLabel}
              </label>
              <input
                id="code"
                className={`${styles.input} ${styles.code}`}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                aria-invalid={fieldError ? "true" : "false"}
                aria-describedby={fieldError ? "code-err" : undefined}
              />
              {fieldError && <ErrorLine id="code-err">{fieldError}</ErrorLine>}
            </div>
            <button type="submit" className={`${styles.primary} ${styles.full}`} disabled={busy} data-busy={busy || undefined}>
              {words.checkButton}
            </button>
            <div className={styles.stackWide}>
              <p className={styles.small}>{words.noEmailArrived}</p>
              <div className={styles.links}>
                <button
                  type="button"
                  className={styles.link}
                  disabled={busy}
                  onClick={async () => {
                    if (await sendCode()) setCode("");
                  }}
                >
                  {words.newCodeLink}
                </button>
                <button type="button" className={styles.link} onClick={() => go({ at: "address" })}>
                  {words.differentEmailLink}
                </button>
              </div>
            </div>
          </form>
        )}
        {step.at === "already" && (
          <>
            <section role="alert" className={styles.card}>
              <p className={`${styles.body} ${styles.bodyStrong}`}>{words.errors.alreadyAnswered}</p>
            </section>
            <div>
              <button type="button" className={styles.link} onClick={() => go({ at: "address" })}>
                {words.differentEmailLink}
              </button>
            </div>
          </>
        )}
        {/* The bot check's script loads on the email step and nowhere else in the survey. */}
        {RECAPTCHA_ENABLED && step.at !== "already" && <RecaptchaInvisible ref={recaptcha} />}
      </main>
    );
  }

  if (step.at === "in") {
    return (
      <main className={styles.column}>
        <div className={styles.stackWide}>
          <div aria-hidden="true" className={styles.done}>
            <svg width="20" height="20" viewBox="0 0 20 20">
              <path d="M4 10.5 8.2 14.5 16 6" fill="none" stroke="var(--color-ok)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 ref={heading} tabIndex={-1} className={styles.h1}>
            {words.afterTheCodeHeading}
          </h1>
        </div>
        <p className={`${styles.body} ${styles.bodyStrong}`}>{words.afterTheCode}</p>
        <button
          type="button"
          className={`${styles.primary} ${styles.full}`}
          onClick={() => session && showPage(0, session.order)}
        >
          {words.afterTheCodeButton}
        </button>
      </main>
    );
  }

  if (step.at === "end") {
    return (
      <main className={styles.column}>
        <div className={styles.stackWide}>
          <h1 ref={heading} tabIndex={-1} className={`${styles.h1} ${styles.h1Thanks}`}>
            {survey.end.heading}
          </h1>
          <p className={`${styles.body} ${styles.bodyStrong}`}>{survey.end.body}</p>
        </div>
        <section className={`${styles.card} ${styles.cardRoomy}`}>
          <p className={`${styles.body} ${styles.bodyStrong}`}>{survey.end.petition}</p>
          {/* A plain link in a new tab. Never a form here, and nothing in the
              link, or sent with it, says where the person came from. */}
          <a href={survey.end.newsletterHref} target="_blank" rel="noopener noreferrer" className={styles.linkButton}>
            {survey.end.newsletterButton}
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">
              <path d="M5 2h7v7M12 2 4.5 9.5M10 12H2V4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </section>
        <p className={styles.body}>{survey.end.passItOn}</p>
        <Support support={survey.support} />
      </main>
    );
  }

  // A page of questions.
  const pageId = sequence[step.index];
  const page = survey.pages.find((p) => p.id === pageId);
  if (!session || !page) return null;
  const total = sequence.length;
  const number = step.index + 1;
  const last = number === total;
  const firstProposal = sequence.findIndex((id) => survey.pages.find((p) => p.id === id)?.proposal);
  const intro = page.proposal
    ? step.index === firstProposal
      ? survey.proposalsIntro.first
      : survey.proposalsIntro.later
    : page.intro;
  // On a page whose lines have no question of their own, the intro IS the question.
  const introAsks = page.questions.some((q) => q.type === "lines" && q.text === null);
  const pageAnswers = own(answers, page.id) ?? {};

  return (
    <main className={`${styles.column} ${styles.columnPage}`}>
      <h1 className="visually-hidden">{survey.title}</h1>
      <div className={styles.stackWide}>
        <div className={styles.pageHead}>
          <h2 ref={heading} tabIndex={-1} className={styles.pageHeading}>
            {page.heading}
          </h2>
          <span className={styles.pageOf}>
            {survey.ui.progress.replace("{n}", String(number)).replace("{total}", String(total))}
          </span>
        </div>
        <div aria-hidden="true" className={styles.track}>
          <div className={styles.trackFill} style={{ width: `${Math.round((number / total) * 100)}%` }} />
        </div>
      </div>
      {intro && <p className={`${styles.body} ${introAsks ? styles.bodyStrong : ""}`}>{intro}</p>}
      <PageOfQuestions
        key={page.id}
        page={page}
        scales={survey.scales}
        lineOrders={lineOrders}
        answers={pageAnswers}
        charactersLeft={survey.ui.charactersLeft}
        selectPlaceholder={survey.ui.selectPlaceholder}
        rankWords={survey.ui.rank}
        onChange={(codeOf, value) =>
          setAnswers((current) => {
            const next = { ...(own(current, page.id) ?? {}) };
            if (value === undefined) delete next[codeOf];
            else next[codeOf] = value;
            return { ...current, [page.id]: next };
          })
        }
      />
      <div className={styles.foot}>
        {(saveFailed || ended) && (
          <p role="alert" className={styles.failed}>
            {ended ? survey.ui.sessionEnded : survey.ui.saveFailed}
          </p>
        )}
        <div className={styles.footNotes}>
          <p>{survey.ui.skipNote}</p>
          <p>{survey.ui.savedNote}</p>
        </div>
        <div className={styles.footButtons}>
          {step.index > floor && (
            <button
              type="button"
              className={`${styles.secondary} ${styles.back}`}
              disabled={busy}
              onClick={() => showPage(step.index - 1, session.order)}
            >
              {survey.ui.back}
            </button>
          )}
          <button
            type="button"
            className={`${styles.primary} ${styles.next}`}
            disabled={busy || ended}
            data-busy={busy || undefined}
            onClick={() => void save(step.index)}
          >
            {busy ? survey.ui.saving : saveFailed ? survey.ui.tryAgain : last ? survey.ui.finish : survey.ui.next}
          </button>
        </div>
      </div>
    </main>
  );
}

/**
 * The site's own reCAPTCHA wording, as the join form and the application form
 * show it, with Google's two links. Shown wherever the bot check runs.
 */
function RecaptchaLine() {
  if (!RECAPTCHA_ENABLED) return null;
  return (
    <p className={styles.small}>
      This site is protected by reCAPTCHA. Google’s{" "}
      <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
        Privacy Policy
      </a>{" "}
      and{" "}
      <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">
        Terms of Service
      </a>{" "}
      apply.
    </p>
  );
}
