"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import InitialsChip from "@/components/ui/InitialsChip";
import Switch from "@/components/ui/Switch";
import kit from "@/features/applications/kit/kit.module.css";
import { useHydrated } from "@/hooks/useHydrated";
import {
  accountsRefusedLine,
  accountsWaitingLine,
  applicationsLabel,
  declinedLine,
  emailsLabel,
  inFlightLine,
  noAddressLine,
  owedButtonLabel,
  owedLine,
  ownApplicationLine,
  reportLines,
  sendButtonLabel,
  sendTotalsLine,
  suMembershipLabel,
  unconfirmedLine,
} from "@/lib/applications/decisionDay/boardWords";
import { SEND_APPROVES_WAITING_ACCOUNTS } from "@/lib/applications/decisionDay/built";
import type { DecisionEmailKind } from "@/lib/applications/decisionDay/emailCopy";
import type {
  EmailPreview,
  SendBoard as Board,
  SendGroup,
  SendPerson,
  SendReport,
} from "@/lib/applications/decisionDay/views";
import shared from "./decisionDay.module.css";
import Icon from "./Icon";
import { Page, Pill, type PillTone } from "./parts";
import styles from "./SendBoard.module.css";

/**
 * Decision day: whether the term is ready, who is in each of the four groups,
 * each email as it will read, a test to yourself, and the one button that
 * sends.
 *
 * ## The button's number is a promise
 *
 * It says how many emails a press sends, and it sends that number back with
 * the press. If a lead changed a decision in between, the server refuses and
 * says so, and the page is reloaded before anything goes.
 *
 * ## No pop-up
 *
 * Sending is the careful action on this page, and its care is the test and
 * the number, not an "are you sure". The line beside the button says it cannot
 * be unsent.
 *
 * ## The test comes first
 *
 * The server refuses a press until an admin has sent themselves a test of
 * these emails as they are worded now, and says so in the list of things
 * still to do. The last readiness row says who tested and when, or that a
 * test is owed. After "Send a test to me" the page is read again from the
 * server, because whether the test counted is the server's to say: one this
 * copy of the site held, or one to an address on the do-not-email list,
 * reached nobody and does not.
 *
 * ## What happened is said in full
 *
 * After a press the page says what the server did, in counts that add up:
 * who was told, who was emailed, whose email was held because this copy of
 * the site may not write to them, and whose email failed, by name.
 *
 * ## An email that did not follow its result stays on the page
 *
 * Somebody who has their result and not their email is named in a card of
 * their own for as long as that is true, whether or not the term is marked as
 * sent. The Send button takes those emails up along with everybody not yet
 * told. When that button cannot be pressed (the term is sent, or is not
 * ready), the card has its own, which sends the owed emails and tells nobody
 * new. An email nobody can vouch for is named too, and is never sent again.
 */

/** How many people a group lists before the rest fold behind "+N more". */
const NAMES_SHOWN = 6;

const BUTTON_LOOK = {
  primary: styles.letterButtonPrimary,
  quiet: styles.letterButtonQuiet,
  outline: styles.letterButtonOutline,
} as const;

function Letter({ board, preview }: { board: Board; preview: EmailPreview | null }) {
  if (!preview) {
    return (
      <div className={styles.letter}>
        <p className={styles.letterNone}>Nobody is in this group, so no email goes out for it.</p>
      </div>
    );
  }
  const rows: [string, ReactNode][] = [
    ["From", board.fromName],
    ["Reply to", board.replyTo],
    ["To", preview.to],
    ["Subject", <span key="subject" className={styles.letterSubject}>{preview.subject}</span>],
  ];
  return (
    <div className={styles.letter}>
      <dl className={styles.letterMeta}>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.letterRow}>
            <dt className={`${kit.mono} ${styles.letterLabel}`}>{label}</dt>
            <dd className={styles.letterValue}>{value}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.letterBody}>
        <p className={styles.letterText}>{preview.greeting}</p>
        {preview.paragraphs.map((paragraph, at) => (
          <p key={at} className={styles.letterText}>
            {paragraph}
          </p>
        ))}
        {preview.buttons.length > 0 ? (
          <div className={styles.letterButtons}>
            {preview.buttons.map((button) => (
              <span key={button.label} className={`${styles.letterButton} ${BUTTON_LOOK[button.look]}`}>
                {button.label}
              </span>
            ))}
          </div>
        ) : null}
        <p className={styles.letterSign}>
          {preview.signOff.name}
          {preview.signOff.role ? (
            <>
              <br />
              <span className={styles.letterSignRole}>{preview.signOff.role}</span>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

function Group({
  board,
  group,
  title,
  tone,
  first,
  editable,
  children,
}: {
  board: Board;
  group: SendGroup;
  title: string;
  tone: PillTone;
  first?: boolean;
  /** Whether the wording can still be changed: not once the term is sent. */
  editable: boolean;
  /** The line or lines that say what this group is. */
  children: ReactNode;
}) {
  const [all, setAll] = useState(false);
  const hidden = Math.max(0, group.people.length - NAMES_SHOWN);
  const listed = all ? group.people : group.people.slice(0, NAMES_SHOWN);
  return (
    <section className={`${shared.card} ${styles.group} ${first ? styles.groupFirst : ""}`}>
      <div className={styles.groupCols}>
        <div className={styles.groupWho}>
          <div className={styles.groupHead}>
            <h2 className={styles.groupTitle}>{title}</h2>
            <Pill tone={tone} dot>
              {emailsLabel(group.people.length)}
            </Pill>
          </div>
          {children}
          {listed.length > 0 ? (
            <ul className={styles.names}>
              {listed.map((person) => (
                <li key={person.uid} className={styles.name}>
                  <InitialsChip name={person.name} uid={person.uid} size="sm" />
                  <span className={styles.nameWho}>
                    <span className={styles.nameText}>{person.name}</span>
                    {/* For an admin only, as this whole page is. It decides nothing. */}
                    <span className={styles.nameAnswer}>{suMembershipLabel(person.suMembership)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {hidden > 0 ? (
            <button
              type="button"
              className={`${shared.quiet} ${styles.more}`}
              aria-expanded={all}
              onClick={() => setAll((showing) => !showing)}
            >
              {all ? "Show fewer" : `+${hidden} more`}
              {all ? null : <Icon name="chevron-right" size={16} />}
            </button>
          ) : null}
        </div>
        <div className={styles.groupLetter}>
          <div className={styles.letterHead}>
            <div className={`${kit.mono} ${shared.eyebrow}`}>The email</div>
            {editable && group.preview ? (
              group.wordingProgrammeId ? (
                // A programme words its own emails, on its settings page. This
                // page is an admin's, and an admin may open every programme's.
                <Link
                  className={styles.wording}
                  href={`/admin/admissions/forms/${encodeURIComponent(board.roundId)}/programmes/${encodeURIComponent(group.wordingProgrammeId)}/setup`}
                  title="Opens this programme’s settings, where its emails are worded."
                >
                  <Icon name="pencil" />
                  <span>Edit wording</span>
                </Link>
              ) : (
                // "No offer this time" is the form's own email, not a
                // programme's, and no page edits it yet. Drawn, and off.
                <button
                  type="button"
                  className={styles.wording}
                  disabled
                  title="This email is the same for every programme. There is no page to edit it on yet."
                >
                  <Icon name="pencil" />
                  <span>Edit wording</span>
                </button>
              )
            ) : null}
          </div>
          <Letter board={board} preview={group.preview} />
        </div>
      </div>
    </section>
  );
}

function Report({ report }: { report: SendReport }) {
  return (
    <div className={styles.report} role="status">
      <h2 className={styles.reportTitle}>What that send did</h2>
      <ul className={styles.reportLines}>
        {reportLines(report).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

const namesOf = (people: readonly SendPerson[]) => people.map((person) => person.name);

const TEST_KINDS: { kind: DecisionEmailKind; group: "accepted" | "invited" | "noOffer" }[] = [
  { kind: "accepted", group: "accepted" },
  { kind: "invitation", group: "invited" },
  { kind: "no-offer", group: "noOffer" },
];

export default function SendBoard({ initial }: { initial: Board }) {
  const [board, setBoard] = useState(initial);
  const [emailDeclined, setEmailDeclined] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** What went wrong with the press that only sends owed emails, said beside its own button. */
  const [owedProblem, setOwedProblem] = useState<string | null>(null);
  const [report, setReport] = useState<SendReport | null>(null);
  const hydrated = useHydrated();

  const sent = board.sentOn !== null;
  const ready = board.blockers.length === 0;
  const owed = board.owed.people.length;
  // The button's number is everything a press sends: the people not yet told,
  // and the emails still owed to people who were.
  const emails = board.pending.emails + (emailDeclined ? board.pending.declined : 0) + owed;
  const left = board.pending.people;
  const canSend =
    hydrated && ready && !sent && !sending && !testing && (left > 0 || board.published > 0);
  const hasEmail = TEST_KINDS.some(({ group }) => board[group].preview !== null);
  const base = `/api/admissions/forms/${encodeURIComponent(board.roundId)}/send`;

  /** `owedOnly` is the press that tells nobody new and sends only what is owed. */
  async function send(owedOnly = false) {
    // Each press reports beside the button that was pressed.
    const fail = owedOnly ? setOwedProblem : setProblem;
    setSending(true);
    setProblem(null);
    setOwedProblem(null);
    setReport(null);
    try {
      const response = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          owedOnly ? { emails: owed, emailDeclined: false, owedOnly: true } : { emails, emailDeclined },
        ),
      });
      const answer = (await response.json().catch(() => null)) as
        | { board?: Board; report?: SendReport; error?: string }
        | null;
      if (!response.ok || !answer?.board || !answer.report) {
        fail(answer?.error ?? "The send did not go through. Reload the page before trying again.");
        return;
      }
      setBoard(answer.board);
      setReport(answer.report);
    } catch {
      fail(
        "Could not reach the site. Reload the page to see who has been told before pressing Send again.",
      );
    } finally {
      setSending(false);
    }
  }

  /**
   * Read the page again from the server. Whether a test counted, and so
   * whether Send can be pressed, is the server's to say.
   */
  async function reload() {
    try {
      const response = await fetch(base);
      const answer = (await response.json().catch(() => null)) as { board?: Board } | null;
      if (response.ok && answer?.board) setBoard(answer.board);
    } catch {
      // The page keeps what it had. The next press is checked by the server either way.
    }
  }

  async function sendTest() {
    // A test reports beside the button that was pressed: once the term is
    // sent, that is the one in the card of emails still owed.
    const fail = sent ? setOwedProblem : setProblem;
    setTesting(true);
    setTestNote(null);
    setProblem(null);
    setOwedProblem(null);
    let sentCount = 0;
    let held = 0;
    let suppressed = 0;
    try {
      for (const { kind, group } of TEST_KINDS) {
        if (!board[group].preview) continue;
        const response = await fetch(`${base}/test`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind }),
        });
        const answer = (await response.json().catch(() => null)) as
          | { delivery?: "sent" | "held" | "suppressed"; error?: string }
          | null;
        if (!response.ok || !answer?.delivery) {
          fail(answer?.error ?? "That test could not be sent. Try again in a minute.");
          return;
        }
        if (answer.delivery === "sent") sentCount += 1;
        else if (answer.delivery === "held") held += 1;
        else suppressed += 1;
      }
      const at = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      if (held > 0) {
        setTestNote(
          "The test was held, not sent: this copy of the site doesn’t email your address. A held test doesn’t count, so decisions can’t be sent from here until one reaches you.",
        );
      } else if (suppressed > 0) {
        setTestNote(
          "Your address is on the do-not-email list, so the test was not sent. It doesn’t count as a test.",
        );
      } else {
        setTestNote(
          sentCount === 1 ? `Test sent to you at ${at}.` : `${sentCount} tests sent to you at ${at}, one for each email.`,
        );
      }
    } catch {
      fail("Could not reach the site to send that test. Check your connection and try again.");
    } finally {
      // A test that went has been recorded, even when a later one in the same
      // press did not go, so the page is read again whatever happened.
      await reload();
      setTesting(false);
    }
  }

  const waiting = board.accountsWaiting;
  const pool = `/admin/admissions/forms/${encodeURIComponent(board.roundId)}/pool`;

  // The main button takes the owed emails up too whenever it can be pressed.
  const mainSends = ready && !sent;
  const owedShown =
    owed + board.owed.noAddress.length + board.owed.unconfirmed.length + board.owed.inFlight > 0 ||
    report?.owedOnly === true ||
    owedProblem !== null;
  const owedHeld = board.owed.blockers;
  // Once the term is sent the card at the foot of the page has no buttons, so
  // a test still wanted for an owed email is sent from the owed card itself.
  const owedOffersTest = sent && owed > 0 && board.test !== "fresh";

  return (
    <Page
      roundId={board.roundId}
      title={`Send decisions · ${board.termLabel}`}
      chips={<Pill tone="live">{board.today}</Pill>}
      lede={`Every decision for the term goes out together. ${board.applied} ${board.applied === 1 ? "person" : "people"} applied.`}
      aside={ownApplicationLine(board.ownApplication, "send")}
    >
      <section className={`${shared.card} ${styles.ready}`}>
        <div className={styles.readyHead}>
          <h2 className={styles.readyTitle}>{sent ? "Sent" : "Ready to send"}</h2>
          {sent ? (
            <Pill tone="ok" dot>
              Sent {board.sentOn}
            </Pill>
          ) : ready ? (
            <Pill tone="ok" dot>
              All ready
            </Pill>
          ) : (
            <Pill tone="warn" dot>
              Not ready
            </Pill>
          )}
        </div>
        <ul className={styles.checks}>
          {board.readiness.map((row) => (
            <li key={row.key} className={styles.check}>
              <span
                className={row.ready ? styles.checkMark : `${styles.checkMark} ${styles.checkMarkWaiting}`}
              >
                <Icon name={row.ready ? "check" : "warning"} size={15} weight={row.ready ? 2.6 : 1.8} />
              </span>
              <div className={styles.checkWho}>
                <div className={styles.checkTitle}>{row.title}</div>
                <div className={styles.checkOwner}>{row.owner}</div>
              </div>
              <div className={styles.checkStatus}>
                {row.status}
                {row.key === "pooled" && !row.ready ? (
                  <>
                    {". "}
                    <Link className={styles.checkLink} href={pool}>
                      Pick them
                    </Link>
                  </>
                ) : null}
              </div>
              <div className={styles.checkDetail}>{row.detail}</div>
            </li>
          ))}
        </ul>
        <div className={styles.readyNote}>
          <div className={shared.note}>
            <Icon name="info" size={16} className={shared.noteIcon} />
            <span>
              {sent
                ? `${board.sentBy ?? "An admin"} sent these on ${board.sentOn}. They can’t be changed from here now.`
                : "Leads can change a decision until you press Send."}
            </span>
          </div>
        </div>
      </section>

      {owedShown ? (
        <section className={`${shared.card} ${styles.owed}`} aria-label="Emails still owed">
          <div className={styles.sendWords}>
            <h2 className={styles.owedTitle}>Emails still owed</h2>
            {owed > 0 ? (
              <p className={styles.sendWarning}>
                <Icon name="warning" size={16} className={styles.sendWarningIcon} />
                <span>{owedLine(namesOf(board.owed.people), mainSends)}</span>
              </p>
            ) : null}
            {owed > 0 && !mainSends
              ? owedHeld.map((blocker) => (
                  <p key={blocker} className={styles.sendWarning}>
                    <Icon name="warning" size={16} className={styles.sendWarningIcon} />
                    <span>{blocker}</span>
                  </p>
                ))
              : null}
            {board.owed.noAddress.length > 0 ? (
              <p className={styles.sendWarning}>
                <Icon name="warning" size={16} className={styles.sendWarningIcon} />
                <span>{noAddressLine(namesOf(board.owed.noAddress))}</span>
              </p>
            ) : null}
            {board.owed.unconfirmed.length > 0 ? (
              <p className={styles.sendWarning}>
                <Icon name="warning" size={16} className={styles.sendWarningIcon} />
                <span>
                  {unconfirmedLine(namesOf(board.owed.unconfirmed))}{" "}
                  <Link className={styles.checkLink} href="/admin/deliverability">
                    Open Deliverability
                  </Link>
                </span>
              </p>
            ) : null}
            {board.owed.inFlight > 0 ? (
              <p className={styles.sendWarning}>
                <Icon name="info" size={16} className={shared.noteIcon} />
                <span>{inFlightLine(board.owed.inFlight)}</span>
              </p>
            ) : null}
            {sent && testNote ? (
              <p className={styles.sendLine} role="status">
                {testNote}
              </p>
            ) : null}
            {owedProblem ? (
              <p className={shared.problem} role="alert">
                {owedProblem}
              </p>
            ) : null}
          </div>
          {owed > 0 && !mainSends ? (
            <div className={styles.sendActions}>
              {owedOffersTest ? (
                <button
                  type="button"
                  className={shared.secondary}
                  disabled={!hydrated || sending || testing || !hasEmail}
                  onClick={() => void sendTest()}
                >
                  <Icon name="mail" />
                  <span>{testing ? "Sending the test…" : "Send a test to me"}</span>
                </button>
              ) : null}
              <button
                type="button"
                className={kit.primary}
                disabled={!hydrated || sending || testing || owedHeld.length > 0}
                onClick={() => void send(true)}
              >
                <Icon name="send" />
                <span>{sending ? "Sending…" : owedButtonLabel(owed)}</span>
              </button>
            </div>
          ) : null}
          {report?.owedOnly ? <Report report={report} /> : null}
        </section>
      ) : null}

      <Group board={board} group={board.accepted} title="You’re in" tone="ok" first editable={!sent}>
        <p className={styles.groupText}>A presumed yes. They don’t have to reply.</p>
        {SEND_APPROVES_WAITING_ACCOUNTS && !sent ? (
          <div className={shared.note}>
            <Icon name="check" size={16} className={shared.noteIcon} />
            <span>This also approves their account if it was waiting.</span>
          </div>
        ) : waiting > 0 ? (
          // Either the send does not approve accounts, or it has run and
          // somebody's is still waiting: say how many, and where to do it.
          <div className={shared.note}>
            <Icon name="info" size={16} className={shared.noteIcon} />
            <span>{accountsWaitingLine(waiting, SEND_APPROVES_WAITING_ACCOUNTS)}</span>
          </div>
        ) : null}
        {board.accountsRefused.length > 0 ? (
          <div className={shared.note}>
            <Icon name="warning" size={16} className={styles.sendWarningIcon} />
            <span>{accountsRefusedLine(board.accountsRefused.map((person) => person.name))}</span>
          </div>
        ) : null}
      </Group>

      <Group board={board} group={board.invited} title="Invitation" tone="accent" editable={!sent}>
        <p className={styles.groupText}>
          Pooled, and invited to something they didn’t pick.{" "}
          {board.replyBy
            ? board.remindsDaily
              ? `They accept by ${board.replyBy}, and get a reminder each day until they reply.`
              : `They accept by ${board.replyBy}.`
            : "No reply-by date is set yet."}
        </p>
      </Group>

      <Group board={board} group={board.noOffer} title="No offer this time" tone="neutral" editable={!sent}>
        <p className={styles.groupText}>Pooled, with nothing else this term. A kind no.</p>
      </Group>

      <section className={`${shared.card} ${styles.declined}`}>
        <div className={styles.declinedWho}>
          <div className={styles.groupHead}>
            <h2 className={styles.groupTitle}>Declined</h2>
            <Pill tone="danger" dot>
              {applicationsLabel(board.declined.count)}
            </Pill>
          </div>
          <p className={styles.declinedText}>Spam or not eligible.</p>
        </div>
        {/* Once the term is sent the switch has nothing left to decide. */}
        {sent ? null : (
          <div className={styles.declinedSwitch}>
            <Switch
              label="Email them"
              checked={emailDeclined}
              disabled={!hydrated || sending || board.pending.declined === 0}
              onChange={setEmailDeclined}
            />
          </div>
        )}
      </section>

      <section className={`${shared.card} ${styles.send}`}>
        <div className={styles.sendWords}>
          <div className={styles.sendTotals}>
            {sendTotalsLine(
              board.accepted.people.length,
              board.invited.people.length,
              board.noOffer.people.length,
            )}
          </div>
          {board.declined.count > 0 && !sent ? (
            <p className={styles.sendLine}>{declinedLine(board.declined.count, emailDeclined)}</p>
          ) : null}
          {sent ? (
            <p className={styles.sendLine}>
              Sent on {board.sentOn}. It can’t be sent again.
            </p>
          ) : ready ? (
            <p className={styles.sendWarning}>
              <Icon name="warning" size={16} className={styles.sendWarningIcon} />
              <span>
                {board.published === 0
                  ? "This sends now and can’t be unsent."
                  : left === 0
                    ? "Everybody has been told already. This marks the term as sent."
                    : `${board.published} ${board.published === 1 ? "person has" : "people have"} been told already. This sends the rest now and can’t be unsent.`}
              </span>
            </p>
          ) : (
            board.blockers.map((blocker) => (
              <p key={blocker} className={styles.sendWarning}>
                <Icon name="warning" size={16} className={styles.sendWarningIcon} />
                <span>{blocker}</span>
              </p>
            ))
          )}
          {!sent && !board.emailsEveryone ? (
            <p className={styles.sendWarning}>
              <Icon name="info" size={16} className={shared.noteIcon} />
              <span>
                This copy of the site only emails the addresses on its own list. Everybody else’s
                email is held, not sent, which is how a rehearsal works.
              </span>
            </p>
          ) : null}
          {testNote && !sent ? (
            <p className={styles.sendLine} role="status">
              {testNote}
            </p>
          ) : null}
          {problem ? (
            <p className={shared.problem} role="alert">
              {problem}
            </p>
          ) : null}
        </div>
        {sent ? null : (
          <div className={styles.sendActions}>
            <button
              type="button"
              className={shared.secondary}
              disabled={!hydrated || sending || testing || !hasEmail}
              onClick={() => void sendTest()}
            >
              <Icon name="mail" />
              <span>{testing ? "Sending the test…" : "Send a test to me"}</span>
            </button>
            <button
              type="button"
              className={`${kit.primary} ${styles.sendButton}`}
              disabled={!canSend}
              onClick={() => void send()}
            >
              <Icon name="send" />
              <span>
                {sending
                  ? "Sending…"
                  : sendButtonLabel(emails, left, board.pending.perPress, board.published, owed)}
              </span>
            </button>
          </div>
        )}
        {report && !report.owedOnly ? <Report report={report} /> : null}
      </section>
    </Page>
  );
}
