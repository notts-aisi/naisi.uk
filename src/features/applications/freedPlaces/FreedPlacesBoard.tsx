"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import InitialsChip from "@/components/ui/InitialsChip";
import Select from "@/components/ui/Select";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import kit from "@/features/applications/kit/kit.module.css";
import { useHydrated } from "@/hooks/useHydrated";
import type { OfferBoard, OfferGroup, OfferPerson } from "@/lib/applications/freedPlaces/views";
import {
  composeFreedPlaceEmail,
  emailsLine,
  listInWords,
  noFreePlaceSentence,
  offerHeading,
  owedLabel,
  poolHeading,
  reportWords,
  sendLabel,
  testWords,
} from "@/lib/applications/freedPlaces/words";
import { formatRunStartShort } from "@/lib/courses/window";
import styles from "./FreedPlacesBoard.module.css";

/**
 * "Offer freed places", the board st-offer: who gave places back, the window,
 * the pooled applicants who ranked the programme with real checkboxes, the
 * email the first person picked will get, a test to yourself, and the button
 * that says how many it emails.
 *
 * Two things the board does not draw are here because the email needs them
 * and nothing else holds them: the group whose weekly time each person's
 * email names (from the run's groups their week covers, with a seat), and
 * the day they are asked to accept by, chosen per send with the same control
 * the form editor uses for decision day's. Neither has a default.
 *
 * The preview is composed by the function the server sends with, from the
 * same records, so what is read here is what arrives. Whether a press may go
 * is the server's to say: the buttons only stay pressed until it answers, and
 * the page is read again afterwards.
 */

type Said = { tone: "ok" | "problem"; text: string } | null;

const CHIP_TONE = { ok: styles.chipOk, warn: styles.chipWarn, plain: "" } as const;

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={styles.check}>
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A group as the picker offers it: its name, when it meets, and the seats it can still promise. */
function groupOption(group: OfferGroup): string {
  const seats =
    group.seatsFree === null ? "no limit" : `${group.seatsFree} ${group.seatsFree === 1 ? "seat" : "seats"} free`;
  return `${group.name} · ${group.meets} · ${seats}`;
}

export default function FreedPlacesBoard({ board }: { board: OfferBoard }) {
  const router = useRouter();
  const live = useHydrated();
  // Each person picked, and the group whose time their email names ("" until chosen).
  const [picked, setPicked] = useState<ReadonlyMap<string, string>>(new Map());
  const [replyBy, setReplyBy] = useState("");
  const [busy, setBusy] = useState<"test" | "send" | "owed" | null>(null);
  const [said, setSaid] = useState<Said>(null);

  const base = `/api/admissions/forms/${encodeURIComponent(board.roundId)}/programmes/${encodeURIComponent(board.programmeId)}/freed-places`;
  const groupOf = new Map(board.groups.map((group) => [group.id, group]));
  const chosen = board.people.filter((person) => picked.has(person.uid));
  const first = chosen[0] ?? null;
  const firstGroup = first ? groupOf.get(picked.get(first.uid) ?? "") : undefined;
  const replyByLabel = replyBy ? (formatRunStartShort(replyBy) ?? "") : "";
  const preview =
    first && firstGroup
      ? composeFreedPlaceEmail({
          firstName: first.firstName,
          programme: { shortName: board.shortName, kind: board.kind },
          leadName: board.leadName,
          toldOn: first.toldOn,
          meets: firstGroup.meets,
          startsOn: firstGroup.startsOn ?? "",
          freeOn: firstGroup.freeOn,
          replyBy: replyByLabel,
          link: board.applicationLink,
        })
      : null;

  const offering = board.window.open && board.free > 0;
  const everyGroupChosen = chosen.every((person) => (picked.get(person.uid) ?? "") !== "");
  const canTest = live && busy === null && offering && preview !== null;
  const tested = board.test.state === "fresh" && board.test.replyBy === replyBy && replyBy !== "";
  const canSend =
    live &&
    busy === null &&
    offering &&
    chosen.length > 0 &&
    chosen.length <= board.free &&
    everyGroupChosen &&
    replyBy !== "" &&
    tested;
  const owed = board.offered.filter((person) => person.owed);

  function toggle(person: OfferPerson, on: boolean) {
    setSaid(null);
    setPicked((now) => {
      const next = new Map(now);
      if (!on) {
        next.delete(person.uid);
        return next;
      }
      // One group they can make: it is the one. Otherwise the admin chooses.
      next.set(person.uid, person.groupIds.length === 1 ? person.groupIds[0] : "");
      return next;
    });
  }

  async function post(path: string, body: unknown): Promise<{ ok: boolean; answer: Record<string, unknown> | null }> {
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const answer = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      return { ok: response.ok, answer };
    } catch {
      return { ok: false, answer: { error: "Could not reach the site. Check your connection and try again." } };
    }
  }

  const problem = (answer: Record<string, unknown> | null, fallback: string): Said => ({
    tone: "problem",
    text: typeof answer?.error === "string" ? answer.error : fallback,
  });

  async function sendTest() {
    if (!first || !firstGroup) return;
    setBusy("test");
    setSaid(null);
    const { ok, answer } = await post(`${base}/test`, { uid: first.uid, groupId: firstGroup.id, replyBy });
    setBusy(null);
    if (!ok) {
      setSaid(problem(answer, "That test could not be sent. Try again in a minute."));
      return;
    }
    const delivery = answer?.delivery === "held" || answer?.delivery === "suppressed" ? answer.delivery : "sent";
    setSaid({ tone: delivery === "sent" ? "ok" : "problem", text: testWords(delivery, replyByLabel) });
    router.refresh();
  }

  async function sendInvitations() {
    setBusy("send");
    setSaid(null);
    const { ok, answer } = await post(base, {
      picks: chosen.map((person) => ({ uid: person.uid, groupId: picked.get(person.uid) ?? "" })),
      replyBy,
      invitations: chosen.length,
    });
    setBusy(null);
    if (!ok) {
      setSaid(problem(answer, "Those invitations could not be sent. Reload the page and try again."));
      return;
    }
    setPicked(new Map());
    setSaid({ tone: "ok", text: reportWords(answer?.report as Parameters<typeof reportWords>[0]) });
    router.refresh();
  }

  async function sendOwed() {
    setBusy("owed");
    setSaid(null);
    const { ok, answer } = await post(base, { owedOnly: true, emails: owed.length });
    setBusy(null);
    if (!ok) {
      setSaid(problem(answer, "Those emails could not be sent. Reload the page and try again."));
      return;
    }
    setSaid({ tone: "ok", text: reportWords(answer?.report as Parameters<typeof reportWords>[0]) });
    router.refresh();
  }

  const heading = offering ? offerHeading(board.free) : offerHeading(0);
  const lede = !board.window.open
    ? board.window.sentence
    : board.free > 0
      ? [board.gaveBack, board.window.sentence].filter(Boolean).join(" ")
      : `${noFreePlaceSentence(board.shortName)} ${board.window.sentence}`;

  return (
    <ApplicationsRoot className={styles.page}>
      <h2 className={styles.heading}>{heading}</h2>
      <p className={styles.lede}>{lede}</p>
      {board.ownApplication ? (
        <p className={styles.aside}>Your own application is on this form, and is left out of this page.</p>
      ) : null}

      <div className={styles.columns}>
        <div className={styles.main}>
          {offering ? (
            <section className={styles.card} aria-labelledby="freed-pool">
              <div className={styles.cardHead}>
                <div className={styles.cardHeadText}>
                  <h2 id="freed-pool" className={styles.cardTitle}>
                    {poolHeading(board.shortName)}
                  </h2>
                  {board.people.length > 0 ? <p className={styles.cardLede}>{board.told}</p> : null}
                </div>
                <span className={styles.picked} aria-live="polite">
                  {chosen.length} picked
                </span>
              </div>
              {board.people.length === 0 ? (
                <p className={styles.empty}>
                  Nobody told No offer this time is left who ranked {board.shortName}.
                </p>
              ) : (
                <div role="group" aria-label="Pooled applicants" className={styles.list}>
                  {board.people.map((person) => {
                    const on = picked.has(person.uid);
                    const id = `freed-${person.uid}`;
                    const options = person.groupIds
                      .map((groupId) => groupOf.get(groupId))
                      .filter((group): group is OfferGroup => group !== undefined);
                    return (
                      <div key={person.uid} className={styles.row} data-on={on ? "" : undefined}>
                        <label
                          htmlFor={id}
                          className={styles.rowMain}
                          data-cannot={person.cannot ? "" : undefined}
                        >
                          <input
                            id={id}
                            type="checkbox"
                            className={styles.box}
                            checked={on}
                            disabled={!live || person.cannot !== null || busy !== null}
                            onChange={(event) => toggle(person, event.target.checked)}
                          />
                          <span className={styles.boxFace} aria-hidden="true">
                            {on ? <CheckIcon /> : null}
                          </span>
                          <InitialsChip name={person.name} uid={person.uid} size="lg" />
                          <span className={styles.who}>
                            <span className={styles.name}>{person.name}</span>
                            <span className={styles.detail}>{person.detail}</span>
                            <span className={styles.chips}>
                              {person.chips.map((chip) => (
                                <span key={chip.label} className={`${styles.chip} ${CHIP_TONE[chip.tone]}`}>
                                  <span className={styles.chipDot} aria-hidden="true" />
                                  {chip.label}
                                </span>
                              ))}
                            </span>
                            {person.cannot ? <span className={styles.cannot}>{person.cannot}</span> : null}
                          </span>
                          {board.usesScores ? (
                            <span className={styles.score}>
                              {person.score ? <span className={styles.scoreValue}>{person.score}</span> : null}
                              <span className={styles.scoreLabel}>
                                {person.score ? `${board.shortName} score` : "Not scored yet"}
                              </span>
                            </span>
                          ) : null}
                        </label>
                        {on ? (
                          <div className={styles.groupPick}>
                            <label htmlFor={`${id}-group`} className={styles.fieldLabel}>
                              Group whose time the email names
                            </label>
                            <Select
                              id={`${id}-group`}
                              className={styles.select}
                              value={picked.get(person.uid) ?? ""}
                              disabled={!live || busy !== null}
                              onChange={(event) => {
                                const groupId = event.target.value;
                                setSaid(null);
                                setPicked((now) => new Map(now).set(person.uid, groupId));
                              }}
                            >
                              {options.length > 1 ? <option value="">Choose a group</option> : null}
                              {options.map((group) => (
                                <option key={group.id} value={group.id}>
                                  {groupOption(group)}
                                </option>
                              ))}
                            </Select>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}

          {board.offered.length > 0 ? (
            <section className={styles.card} aria-labelledby="freed-offered">
              <h2 id="freed-offered" className={styles.cardTitleSmall}>
                Offered so far
              </h2>
              <ul className={styles.offered}>
                {board.offered.map((person) => (
                  <li key={person.uid} className={styles.offeredRow}>
                    <span className={styles.name}>{person.name}</span>
                    <span className={styles.detail}>{person.said}</span>
                    <span className={styles.muted}>{person.email}</span>
                  </li>
                ))}
              </ul>
              {owed.length > 0 ? (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.outline}
                    disabled={!live || busy !== null}
                    onClick={sendOwed}
                  >
                    {busy === "owed" ? "Sending…" : owedLabel(owed.length)}
                  </button>
                  <span className={styles.muted}>Emails {listInWords(owed.map((person) => person.name))}.</span>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        {offering ? (
          <div className={styles.side}>
            <div className={styles.letterBlock}>
              <div className={kit.mono}>
                {first ? `The email ${first.firstName} will get` : "The email they will get"}
              </div>
              {preview ? (
                <div className={styles.letter}>
                  <dl className={styles.letterHead}>
                    <div className={styles.letterRow}>
                      <dt className={styles.letterKey}>From</dt>
                      <dd className={styles.letterValue}>{board.fromName}</dd>
                    </div>
                    <div className={styles.letterRow}>
                      <dt className={styles.letterKey}>Reply to</dt>
                      <dd className={styles.letterValue}>{board.replyTo}</dd>
                    </div>
                    <div className={styles.letterRow}>
                      <dt className={styles.letterKey}>To</dt>
                      <dd className={styles.letterValue}>{first?.name}</dd>
                    </div>
                    <div className={styles.letterRow}>
                      <dt className={styles.letterKey}>Subject</dt>
                      <dd className={styles.letterValue}>
                        <strong className={styles.letterSubject}>{preview.subject}</strong>
                      </dd>
                    </div>
                  </dl>
                  <div className={styles.letterBody}>
                    <p className={styles.letterText}>{preview.greeting}</p>
                    {preview.paragraphs.map((paragraph) => (
                      <p key={paragraph} className={styles.letterText}>
                        {paragraph}
                      </p>
                    ))}
                    <div className={styles.letterButtons}>
                      {preview.buttons.map((button) => (
                        <span
                          key={button.label}
                          className={button.look === "primary" ? styles.letterPrimary : styles.letterQuiet}
                        >
                          {button.label}
                        </span>
                      ))}
                    </div>
                    <p className={styles.letterSign}>
                      {preview.signOff.name}
                      {preview.signOff.role ? (
                        <>
                          <br />
                          <span className={styles.letterRole}>{preview.signOff.role}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
              ) : (
                <p className={styles.letterEmpty}>
                  {!first
                    ? "Pick somebody, and the email they will get shows here."
                    : !firstGroup
                      ? `Choose the group whose time ${first.firstName}’s email names.`
                      : !replyBy
                        ? "Choose the day they’re asked to accept by."
                        : `${firstGroup.name} has no session still to come, so no email can name its time.`}
                </p>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="freed-reply-by" className={styles.fieldLabel}>
                Invitations accepted by
              </label>
              <input
                id="freed-reply-by"
                type="date"
                className={styles.input}
                min={board.today}
                value={replyBy}
                disabled={!live || busy !== null}
                onChange={(event) => {
                  setSaid(null);
                  setReplyBy(event.target.value);
                }}
              />
            </div>

            <div className={styles.actions}>
              <div className={styles.buttons}>
                <button type="button" className={styles.outline} disabled={!canTest} onClick={sendTest}>
                  {busy === "test" ? "Sending the test…" : "Send a test to me"}
                </button>
                <button
                  type="button"
                  className={`${kit.primary} ${styles.send}`}
                  disabled={!canSend}
                  onClick={sendInvitations}
                >
                  {busy === "send" ? "Sending…" : sendLabel(chosen.length)}
                </button>
              </div>
              <p className={styles.muted}>{emailsLine(chosen.map((person) => person.firstName))}</p>
              {chosen.length > 0 && replyBy && !tested ? (
                <p className={styles.muted}>
                  Send yourself a test first. The invitations go once a test for {replyByLabel} has reached you.
                </p>
              ) : null}
              {chosen.length > board.free ? (
                <p className={styles.muted}>
                  {board.free === 1 ? "There is 1 freed place" : `There are ${board.free} freed places`}: pick no more
                  than that.
                </p>
              ) : null}
            </div>
            {said ? (
              <p className={said.tone === "ok" ? styles.saidOk : styles.saidProblem} role={said.tone === "ok" ? "status" : "alert"}>
                {said.text}
              </p>
            ) : null}
          </div>
        ) : said ? (
          <p className={said.tone === "ok" ? styles.saidOk : styles.saidProblem} role={said.tone === "ok" ? "status" : "alert"}>
            {said.text}
          </p>
        ) : null}
      </div>
    </ApplicationsRoot>
  );
}
