"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import InitialsChip from "@/components/ui/InitialsChip";
import kit from "@/features/applications/kit/kit.module.css";
import { useHydrated } from "@/hooks/useHydrated";
import { APPLICATION_LIMITS, type ProgrammeEmailKind } from "@/lib/applications/model";
import { questionCountLabel } from "@/lib/applications/editor/sets";
import type {
  EmailView,
  PersonView,
  ProgrammeSetupView,
} from "@/lib/applications/editor/views";
import { Chip, DialogFrame, MenuButton, SavedStatus, Toggle, type SaveState } from "./controls";
import { patchProgramme, putProgrammeRoles, type ProgrammePatch } from "./editorClient";
import {
  ArrowRightIcon,
  CalendarIcon,
  CloseIcon,
  InfoIcon,
  MailIcon,
  PencilIcon,
  PlusIcon,
} from "./Icons";
import shared from "./editor.module.css";
import styles from "./ProgrammeSetup.module.css";

/**
 * One programme's Settings tab, for its lead and for admins. The page decides
 * who that is before this renders.
 *
 * SAVING. There is no Save button. What is typed is kept on screen at once
 * and sent a moment after the last keystroke, and the line at the top says
 * which is true: "Saved", "Saving…", or what is stopping it. A switch, a
 * reviewer added or removed, and a wording are sent as they are made.
 *
 * WHAT A LEAD CANNOT DO HERE is drawn and explained, never hidden: changing
 * the lead and closing the programme are an admin's.
 */

const L = APPLICATION_LIMITS;
const SAVE_DELAY_MS = 700;

type Draft = {
  name: string;
  shortName: string;
  pitch: string;
  facts: string;
  starts: string;
  places: string;
  groupCount: string;
  groupSize: string;
};

function draftOf(view: ProgrammeSetupView): Draft {
  return {
    name: view.name,
    shortName: view.shortName,
    pitch: view.pitch,
    facts: view.facts,
    starts: view.starts,
    places: view.places === null ? "" : String(view.places),
    groupCount: view.groupCount === null ? "" : String(view.groupCount),
    groupSize: view.groupSize,
  };
}

/** A box that holds a count: empty is "not said yet", anything else is a whole number. */
function countIn(text: string): number | null | "bad" {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return /^\d{1,5}$/.test(trimmed) ? Number(trimmed) : "bad";
}

/** What has been typed and not yet stored, and what stops it being sent. */
function changesIn(draft: Draft, view: ProgrammeSetupView): { patch: ProgrammePatch; problem: string | null } {
  const patch: ProgrammePatch = {};
  let problem: string | null = null;
  for (const field of ["name", "shortName", "pitch", "facts", "starts", "groupSize"] as const) {
    const value = draft[field].trim();
    if (value !== view[field]) patch[field] = value;
  }
  if (patch.name === "") problem = "The name cannot be empty.";
  if (patch.shortName === "") problem = "The short name cannot be empty.";
  const places = countIn(draft.places);
  if (places === "bad") problem = "The number of places has to be a whole number.";
  else if (places !== view.places) patch.places = places;
  const groups = countIn(draft.groupCount);
  if (groups === "bad" || groups === 0) problem = "The number of groups has to be a whole number.";
  else if (groups !== view.groupCount) patch.groupCount = groups;
  return { patch, problem };
}

export default function ProgrammeSetup({ programme }: { programme: ProgrammeSetupView }) {
  const ids = useId();
  // The boxes are read-only until the page is live, so nothing typed before
  // its JavaScript arrives is written over when it does.
  const live = useHydrated();
  const [view, setView] = useState(programme);
  const [draft, setDraft] = useState(() => draftOf(programme));
  const [serverProblem, setServerProblem] = useState<string | null>(null);
  /** The change the server last refused, so it is not sent again until it differs. */
  const [refused, setRefused] = useState<string | null>(null);
  const [acting, setActing] = useState(0);
  const [settled, setSettled] = useState(0);
  const sending = useRef(false);
  // Answers can come back out of order. Each request takes a number as it is
  // sent, and an answer older than one already shown is dropped, so the page
  // always ends on the newest state it has been told.
  const sent = useRef(0);
  const shown = useRef(0);
  /** The scores switch as it was just pressed, until the server has answered. */
  const [scoresPressed, setScoresPressed] = useState<boolean | null>(null);
  const [dialog, setDialog] = useState<
    { kind: "wording"; email: ProgrammeEmailKind } | { kind: "close" } | null
  >(null);
  /** The email a test is being sent of, and what the last test did. */
  const [testing, setTesting] = useState<ProgrammeEmailKind | null>(null);
  const [testNote, setTestNote] = useState<{ ok: boolean; text: string } | null>(null);

  /**
   * Send this programme's own wording of one email to whoever pressed. The
   * request says which email and nothing else: the server sends it to the
   * address on their own session, never to one named here.
   */
  const sendTest = async (email: ProgrammeEmailKind, title: string) => {
    setTesting(email);
    setTestNote(null);
    try {
      const response = await fetch(
        `/api/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.id)}/test-email`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: email }),
        },
      );
      const answer = (await response.json().catch(() => null)) as
        | { delivery?: "sent" | "held" | "suppressed"; error?: string }
        | null;
      if (!response.ok || !answer?.delivery) {
        setTestNote({ ok: false, text: answer?.error ?? "That test could not be sent. Try again in a minute." });
      } else if (answer.delivery === "held") {
        setTestNote({
          ok: true,
          text: "The test was held, not sent. This copy of the site doesn’t email your address, which is how a rehearsal works.",
        });
      } else if (answer.delivery === "suppressed") {
        setTestNote({ ok: false, text: "Your address is on the do-not-email list, so the test was not sent." });
      } else {
        const at = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        setTestNote({ ok: true, text: `Test of “${title}” sent to you at ${at}.` });
      }
    } catch {
      setTestNote({ ok: false, text: "Could not reach the site to send that test. Check your connection and try again." });
    } finally {
      setTesting(null);
    }
  };

  const { patch, problem: heldBack } = changesIn(draft, view);
  const key = JSON.stringify(patch);
  const dirty = key !== "{}";
  const isAdmin = view.role === "admin";
  const formHref = `/admin/admissions/forms/${view.roundId}/form`;

  useEffect(() => {
    if (!dirty || heldBack || key === refused) return;
    const timer = setTimeout(() => {
      if (sending.current) return;
      sending.current = true;
      sent.current += 1;
      const turn = sent.current;
      patchProgramme(view.roundId, view.id, JSON.parse(key) as ProgrammePatch)
        .then((saved) => {
          if (turn > shown.current) {
            shown.current = turn;
            setView(saved.programme);
          }
          setServerProblem(null);
        })
        .catch((err: unknown) => {
          setServerProblem(err instanceof Error ? err.message : "That did not save.");
          setRefused(key);
        })
        .finally(() => {
          sending.current = false;
          setSettled((count) => count + 1);
        });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [dirty, heldBack, key, refused, settled, view.roundId, view.id]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Something sent the moment it is done: a switch, a reviewer, a wording. */
  const act = async (action: () => Promise<{ programme: ProgrammeSetupView }>): Promise<boolean> => {
    setActing((count) => count + 1);
    sent.current += 1;
    const turn = sent.current;
    try {
      const saved = await action();
      if (turn > shown.current) {
        shown.current = turn;
        setView(saved.programme);
      }
      setServerProblem(null);
      return true;
    } catch (err) {
      setServerProblem(err instanceof Error ? err.message : "That did not save.");
      return false;
    } finally {
      setActing((count) => count - 1);
    }
  };

  const type = (field: keyof Draft) => (value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setRefused(null);
  };

  const saveState: SaveState = heldBack
    ? "waiting"
    : serverProblem
      ? "problem"
      : dirty || acting > 0
        ? "saving"
        : "saved";

  // One change to who reviews at a time: the next is worked out from the
  // answer to the last, so its controls wait for that answer.
  const busy = acting > 0;
  const reviewerUids = view.reviewers.map((person) => person.uid);
  const named = new Set([...reviewerUids, ...(view.lead ? [view.lead.uid] : [])]);
  const addable = view.candidates.filter((candidate) => !named.has(candidate.uid));
  const leadChoices = view.candidates.filter((candidate) => candidate.uid !== view.lead?.uid);
  const setReviewers = (uids: string[]) =>
    act(() => putProgrammeRoles(view.roundId, view.id, { reviewerUids: uids }));
  const setLead = (uid: string | null) =>
    act(() => putProgrammeRoles(view.roundId, view.id, { leadUid: uid }));

  const streamSetId = view.questionSets.find((set) => set.scored)?.id ?? view.questionSets[0]?.id;
  const everyone = [view.lead, ...view.reviewers].filter((person): person is PersonView => person !== null);

  return (
    <div className={styles.stack}>
      <div className={styles.intro}>
        <p className={styles.introText}>Everything here shows on the programme’s public page.</p>
        <SavedStatus state={saveState} problem={heldBack ? `Not saved yet. ${heldBack}` : serverProblem} />
      </div>

      <section className={shared.card} aria-labelledby={`${ids}-basics`}>
        <h2 id={`${ids}-basics`} className={shared.cardTitle}>
          Basics
        </h2>
        <div className={`${styles.cardBody} ${styles.basics}`}>
          <div className={`${shared.field} ${styles.basicsName}`}>
            <label htmlFor={`${ids}-name`} className={shared.label}>
              Name
            </label>
            <input
              id={`${ids}-name`}
              type="text"
              className={shared.input}
              value={draft.name}
              readOnly={!live}
              maxLength={L.programmeName}
              onChange={(event) => type("name")(event.target.value)}
            />
          </div>
          <div className={`${shared.field} ${styles.basicsPitch}`}>
            <label htmlFor={`${ids}-pitch`} className={shared.label}>
              One-line description
            </label>
            <textarea
              id={`${ids}-pitch`}
              rows={2}
              className={shared.textarea}
              value={draft.pitch}
              readOnly={!live}
              maxLength={L.programmePitch}
              onChange={(event) => type("pitch")(event.target.value)}
            />
            <div className={shared.counter} aria-live="polite">
              {draft.pitch.length} / {L.programmePitch}
            </div>
          </div>
        </div>
        <div className={`${styles.basics} ${styles.basicsSecond}`}>
          <div className={`${shared.field} ${styles.basicsMore}`}>
            <label htmlFor={`${ids}-short`} className={shared.label}>
              Short name
            </label>
            <input
              id={`${ids}-short`}
              type="text"
              className={shared.input}
              value={draft.shortName}
              readOnly={!live}
              maxLength={L.programmeShortName}
              disabled={view.lockedSentence !== null}
              onChange={(event) => type("shortName")(event.target.value)}
            />
            <p className={shared.hint}>
              {view.lockedSentence
                ? "Fixed now that people have applied: their answers name it."
                : "What rankings, chips and emails call it."}
            </p>
          </div>
          <div className={`${shared.field} ${styles.basicsMore}`}>
            <label htmlFor={`${ids}-facts`} className={shared.label}>
              Facts line
            </label>
            <input
              id={`${ids}-facts`}
              type="text"
              className={shared.input}
              value={draft.facts}
              readOnly={!live}
              maxLength={L.programmeFacts}
              onChange={(event) => type("facts")(event.target.value)}
            />
            <p className={shared.hint}>Under the name where applicants choose, like 6 weeks · ~5 hrs a week.</p>
          </div>
        </div>
      </section>

      <section className={shared.card} aria-labelledby={`${ids}-dates`}>
        <h2 id={`${ids}-dates`} className={shared.cardTitle}>
          Dates and places
        </h2>
        <div className={styles.cardBody}>
          <div className={styles.datesLine}>
            <span className={styles.datesIcon}>
              <CalendarIcon size={16} />
            </span>
            <span>
              {view.opens && view.closes ? (
                <>
                  Applications open <strong>{view.opens.day}</strong> and close{" "}
                  <strong>{view.closes.dayAndTime}</strong>.{" "}
                </>
              ) : (
                <>Applications have no dates yet. </>
              )}
              {view.decisions && (
                <>
                  Everyone hears on <strong>{view.decisions.day}</strong>.{" "}
                </>
              )}
              These are the same for every programme, and admins set them in the{" "}
              {isAdmin ? <Link href={formHref}>Application form</Link> : "Application form"}.
            </span>
          </div>
          <div className={styles.trio}>
            <div className={shared.field}>
              <label htmlFor={`${ids}-starts`} className={shared.label}>
                Starts
              </label>
              <input
                id={`${ids}-starts`}
                type="text"
                className={shared.input}
                value={draft.starts}
                readOnly={!live}
                maxLength={L.programmeStarts}
                onChange={(event) => type("starts")(event.target.value)}
              />
            </div>
            <div className={shared.field}>
              <label htmlFor={`${ids}-places`} className={shared.label}>
                Places
              </label>
              <input
                id={`${ids}-places`}
                type="text"
                inputMode="numeric"
                className={shared.input}
                value={draft.places}
                readOnly={!live}
                maxLength={5}
                onChange={(event) => type("places")(event.target.value)}
              />
              <div className={styles.across}>
                <span>Across</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className={styles.acrossInput}
                  aria-label="Number of groups"
                  value={draft.groupCount}
                  readOnly={!live}
                  maxLength={4}
                  onChange={(event) => type("groupCount")(event.target.value)}
                />
                <span>{draft.groupCount.trim() === "1" ? "group" : "groups"}</span>
              </div>
            </div>
            <div className={shared.field}>
              <label htmlFor={`${ids}-size`} className={shared.label}>
                Group size
              </label>
              <input
                id={`${ids}-size`}
                type="text"
                className={shared.input}
                value={draft.groupSize}
                readOnly={!live}
                maxLength={L.programmeGroupSize}
                onChange={(event) => type("groupSize")(event.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      <div className={`${kit.mono} ${styles.divider}`}>Not shown publicly</div>

      <section className={shared.card} aria-labelledby={`${ids}-questions`}>
        <h2 id={`${ids}-questions`} className={shared.cardTitle}>
          Questions
        </h2>
        <p className={shared.cardNote}>{view.shortName}’s questions live in the Application form.</p>
        <div className={styles.cardBody}>
          {view.lockedSentence && (
            <div role="status" className={shared.notice}>
              <span className={shared.noticeIcon}>
                <InfoIcon />
              </span>
              <div className={shared.noticeBody}>{view.lockedSentence}</div>
            </div>
          )}
          {view.questionSets.length > 0 ? (
            <ol className={styles.summary}>
              {view.questionSets.map((set) => (
                <li key={set.id} className={styles.summaryRow}>
                  <span className={styles.summaryName}>{set.label}</span>
                  <span className={styles.summarySide}>
                    <span>{questionCountLabel(set.questions)}</span>
                    {set.scored ? <Chip tone="accent">Scored</Chip> : <Chip>Not scored</Chip>}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className={shared.cardNote}>No question sets apply to this programme yet.</p>
          )}
          <div className={styles.openForm}>
            {isAdmin ? (
              <Link
                href={streamSetId ? `${formHref}?set=${encodeURIComponent(streamSetId)}` : formHref}
                className={`${shared.btn} ${shared.btnSm} ${shared.btnQuiet}`}
              >
                <span>Open the Application form</span>
                <ArrowRightIcon />
              </Link>
            ) : (
              <p className={shared.hint}>An admin changes the questions, in the Application form.</p>
            )}
          </div>
        </div>
      </section>

      <section className={shared.card} aria-labelledby={`${ids}-reviewing`}>
        <h2 id={`${ids}-reviewing`} className={shared.cardTitle}>
          Reviewing
        </h2>
        <div className={styles.cardBody}>
          <div className={styles.people}>
            <div className={styles.peopleGroup}>
              <div className={shared.label}>Lead</div>
              <div className={styles.peopleRow}>
                {view.lead ? (
                  <PersonPill person={view.lead} />
                ) : (
                  <span className={`${styles.person} ${styles.personNobody}`}>Nobody yet</span>
                )}
                {isAdmin && (
                  <MenuButton
                    label={view.lead ? "Change the lead" : "Choose a lead"}
                    className={`${shared.btn} ${shared.btnSm} ${shared.btnQuiet}`}
                    placement="below"
                    align="left"
                    disabled={busy}
                    empty="Nobody else can lead yet. A lead has to be an admin or SU-recognised committee."
                    actions={[
                      ...leadChoices.map((candidate) => ({
                        label: candidate.fullName,
                        onSelect: () => void setLead(candidate.uid),
                      })),
                      ...(view.lead
                        ? [{ label: "Nobody for now", onSelect: () => void setLead(null) }]
                        : []),
                    ]}
                  >
                    {view.lead ? "Change" : "Choose"}
                  </MenuButton>
                )}
              </div>
              <div className={styles.peopleNote}>Only an admin can change the lead.</div>
            </div>
            <div className={styles.peopleGroup}>
              <div className={shared.label}>Reviewers</div>
              <div className={styles.peopleRow}>
                {view.reviewers.map((person) => (
                  <PersonPill
                    key={person.uid}
                    person={person}
                    disabled={busy}
                    onRemove={() => void setReviewers(reviewerUids.filter((uid) => uid !== person.uid))}
                  />
                ))}
                <MenuButton
                  label="Add a reviewer"
                  className={`${shared.btn} ${shared.btnSm} ${shared.btnQuiet}`}
                  placement="below"
                  align="left"
                  disabled={busy || view.reviewers.length >= L.maxProgrammeReviewers}
                  empty="Nobody else can be added. A reviewer has to be an admin or SU-recognised committee."
                  actions={addable.map((candidate) => ({
                    label: candidate.fullName,
                    onSelect: () => void setReviewers([...reviewerUids, candidate.uid]),
                  }))}
                >
                  <PlusIcon />
                  <span>Add</span>
                </MenuButton>
              </div>
            </div>
          </div>

          <div className={styles.scores}>
            <Toggle
              label="Use scores for this programme"
              note={`Reviewers score each ${view.shortName} answer 1 to 5. You get scores by section and recommendations.`}
              checked={scoresPressed ?? view.useScores}
              onChange={(useScores) => {
                setScoresPressed(useScores);
                void act(() => patchProgramme(view.roundId, view.id, { useScores })).finally(() =>
                  setScoresPressed(null),
                );
              }}
            />
          </div>

          <div className={styles.facts}>
            <div className={styles.fact}>
              <div className={styles.factTitle}>Lead and reviewers</div>
              <div className={styles.factWho}>
                {everyone.length > 0 ? everyone.map((person) => person.name).join(", ") : "Nobody yet"}
              </div>
              <div className={styles.factText}>
                Read applications, score answers and comment. The lead decides.
              </div>
            </div>
            <div className={styles.fact}>
              <div className={styles.factTitle}>Comments and scores</div>
              <div className={styles.factWho}>Admins and SU-recognised committee</div>
              <div className={styles.factText}>
                Nobody else sees them. A first review is blind to other scores.
              </div>
            </div>
            <div className={styles.fact}>
              <div className={styles.factTitle}>Email addresses</div>
              <div className={styles.factWho}>Admins only</div>
              <div className={styles.factText}>Facilitators never see applications.</div>
            </div>
          </div>
        </div>
      </section>

      <section className={shared.card} aria-labelledby={`${ids}-emails`}>
        <h2 id={`${ids}-emails`} className={shared.cardTitle}>
          Emails
        </h2>
        <p className={shared.cardNote}>
          {view.decisions
            ? `An admin sends every programme’s decisions together on ${view.decisions.day}.`
            : "An admin sends every programme’s decisions together."}
        </p>
        <ul className={styles.emails}>
          {view.emails.map((email) => (
            <li key={email.kind} className={styles.email}>
              <div className={styles.emailMain}>
                <div className={styles.emailTitle}>{email.title}</div>
                <div className={styles.emailLine}>
                  “{email.subject}” · {email.note}
                </div>
              </div>
              <div className={styles.emailActions}>
                <button
                  type="button"
                  className={`${shared.btn} ${shared.btnSm}`}
                  aria-label={`Edit wording of the ${email.title} email`}
                  onClick={() => setDialog({ kind: "wording", email: email.kind })}
                >
                  <PencilIcon />
                  <span>Edit wording</span>
                </button>
                {/* The wording as it is saved, to the person pressing and nobody else. */}
                <button
                  type="button"
                  className={`${shared.btn} ${shared.btnSm} ${shared.btnQuiet}`}
                  aria-label={`Send a test of the ${email.title} email to yourself`}
                  disabled={!live || testing !== null}
                  onClick={() => void sendTest(email.kind, email.title)}
                >
                  <MailIcon />
                  <span>{testing === email.kind ? "Sending…" : "Send a test"}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
        {testNote ? (
          <p role={testNote.ok ? "status" : "alert"} className={testNote.ok ? shared.cardNote : shared.problem}>
            {testNote.text}
          </p>
        ) : null}
        <div className={`${shared.aside} ${styles.emailsNote}`}>
          <span className={shared.asideIcon}>
            <InfoIcon size={16} />
          </span>
          <span>The “No offer this time” email is the same for every programme. Admins edit it.</span>
        </div>
      </section>

      <section className={`${shared.card} ${styles.careful}`} aria-labelledby={`${ids}-careful`}>
        <div className={styles.carefulMain}>
          <h2 id={`${ids}-careful`} className={shared.cardTitle}>
            Careful
          </h2>
          <p className={shared.cardNote}>
            {view.closed
              ? `${view.shortName} is closed. It is off the site and out of the application form, and its applications are kept.`
              : `Closing ${view.shortName} takes it off the site and out of the application form.`}
            {!isAdmin && " Only an admin can do this."}
          </p>
        </div>
        {view.closed ? (
          <button
            type="button"
            className={shared.btn}
            disabled={!isAdmin}
            onClick={() => void act(() => patchProgramme(view.roundId, view.id, { closed: false }))}
          >
            Reopen {view.shortName}
          </button>
        ) : (
          <button
            type="button"
            className={`${shared.btn} ${shared.btnCareful}`}
            disabled={!isAdmin}
            onClick={() => setDialog({ kind: "close" })}
          >
            Close {view.shortName}
          </button>
        )}
      </section>

      {dialog?.kind === "wording" && (
        <WordingDialog
          email={view.emails.find((email) => email.kind === dialog.email) ?? null}
          onClose={() => setDialog(null)}
          onSave={async (wording) => {
            const ok = await act(() =>
              patchProgramme(view.roundId, view.id, { emailWording: { [dialog.email]: wording } }),
            );
            if (ok) setDialog(null);
            return ok;
          }}
        />
      )}
      {dialog?.kind === "close" && (
        <DialogFrame
          open
          width="sm"
          title={`Close ${view.shortName}?`}
          onClose={() => setDialog(null)}
          actions={
            <>
              <button type="button" className={shared.btn} onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`${shared.btn} ${shared.btnCareful}`}
                onClick={async () => {
                  const ok = await act(() => patchProgramme(view.roundId, view.id, { closed: true }));
                  if (ok) setDialog(null);
                }}
              >
                Close {view.shortName}
              </button>
            </>
          }
        >
          <p className={shared.dialogText}>
            It comes off the site and out of the application form, so nobody new can choose it.
          </p>
          <p className={shared.dialogText}>
            {view.applications === 0
              ? "Nobody has applied to it yet."
              : `Its ${view.applications} ${view.applications === 1 ? "application is" : "applications are"} kept.`}{" "}
            Its settings, questions and reviewers stay as they are, and an admin can reopen it here.
          </p>
          {serverProblem && (
            <p role="alert" className={shared.problem}>
              {serverProblem}
            </p>
          )}
        </DialogFrame>
      )}
    </div>
  );
}

function PersonPill({
  person,
  onRemove,
  disabled,
}: {
  person: PersonView;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  return (
    <span className={`${styles.person} ${onRemove ? styles.personRemovable : ""}`}>
      <InitialsChip name={person.name} uid={person.uid} />
      <span className={styles.personName}>
        {person.name}
        {person.you && <span className={styles.personYou}> (you)</span>}
      </span>
      {onRemove && (
        <button
          type="button"
          className={styles.personRemove}
          aria-label={`Remove ${person.name}`}
          disabled={disabled}
          onClick={onRemove}
        >
          <CloseIcon size={16} />
        </button>
      )}
    </span>
  );
}

/** The programme's own wording for one decision-day email. */
function WordingDialog({
  email,
  onClose,
  onSave,
}: {
  email: EmailView | null;
  onClose: () => void;
  onSave: (wording: { subject: string; body: string } | null) => Promise<boolean>;
}) {
  const ids = useId();
  const [subject, setSubject] = useState(email?.wording?.subject ?? "");
  const [body, setBody] = useState(email?.wording?.body ?? "");
  const [busy, setBusy] = useState(false);
  if (!email) return null;

  const save = async (wording: { subject: string; body: string } | null) => {
    setBusy(true);
    await onSave(wording);
    setBusy(false);
  };

  return (
    <DialogFrame
      open
      title={`Wording of the ${email.title} email`}
      onClose={onClose}
      actions={
        <>
          {email.wording && (
            <button
              type="button"
              className={`${shared.btn} ${shared.btnQuiet}`}
              disabled={busy}
              onClick={() => void save(null)}
            >
              Use the standard wording
            </button>
          )}
          <button type="button" className={shared.btn} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={kit.primary}
            disabled={busy}
            onClick={() => void save({ subject: subject.trim(), body: body.trim() })}
          >
            {busy ? "Saving…" : "Save wording"}
          </button>
        </>
      }
    >
      <p className={shared.dialogText}>
        Leave a box empty to keep the standard wording for it.
      </p>
      <div className={shared.dialogFields}>
        <div className={shared.field}>
          <label htmlFor={`${ids}-subject`} className={shared.label}>
            Subject
          </label>
          <input
            id={`${ids}-subject`}
            type="text"
            className={shared.input}
            value={subject}
            placeholder={email.wording ? undefined : email.subject}
            maxLength={L.emailSubject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>
        <div className={shared.field}>
          <label htmlFor={`${ids}-body`} className={shared.label}>
            Message
          </label>
          <textarea
            id={`${ids}-body`}
            rows={8}
            className={`${shared.textarea} ${styles.wordingBody}`}
            value={body}
            maxLength={L.emailBody}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className={shared.counter} aria-live="polite">
            {body.length} / {L.emailBody}
          </div>
        </div>
      </div>
    </DialogFrame>
  );
}
