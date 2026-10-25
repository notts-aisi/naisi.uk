"use client";

import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import type { OverviewGroup } from "@/app/api/courses/runs/[runId]/overview/route";
import { validateSubmissionUrl } from "@/lib/firestore/courses";
import {
  GROUP_FIELD_LIMITS,
  type GroupSessionMode,
} from "@/lib/firestore/courseGroups";
import { sessionWhenLabel } from "@/lib/courses/londonLabels";
import {
  addDaysToKey,
  isValidDateKey,
  londonDateKey,
  londonWallClockToInstant,
} from "@/lib/courses/weekPlan";
import {
  CANCELLED_CARD,
  JOIN_ONLINE,
  LINK_IS_HERE,
  LINK_WILL_BE_HERE,
} from "@/lib/courses/sessionChange/words";
import styles from "./SessionCard.module.css";

/**
 * The group's session for the slot being viewed — presentational, no data
 * access of its own.
 *
 * A group stores a RECURRING slot (`weekday` + `startTimeLocal`), not dates,
 * so the concrete session is derived: the slot the cohort is in starts on
 * `slotStartKey`, and the session is the first `weekday` on or after it. Both
 * ends of that arithmetic are civil-date maths (`addDaysToKey`) rather than
 * elapsed milliseconds, and only the final wall clock becomes an instant
 * (`londonWallClockToInstant`), so a clock-change week resolves to the right
 * London evening instead of drifting an hour.
 *
 * NO ICS EXPORT HERE, deliberately: `src/lib/events/` builds an ICS from an
 * event document (one dated thing with a title and a location), and a course
 * session is a slot inside a plan — the recurring rule, the per-week
 * overrides and the break weeks have no counterpart in that helper. A
 * calendar feed for a cohort is its own piece of work, not a prop on this card.
 *
 * ── VIRTUAL vs IN-PERSON (v2 decision 7), THE MEMBER'S END ──────────────────
 * `mode` is the facilitator's per-week switch, and this card is where it
 * cashes out. THE POINT IS THE SUPPRESSION, not the addition: an online week
 * hides the room, an in-person week hides the join button. Showing both — the
 * old behaviour — is precisely what sends half a group to a room nobody is in.
 *
 * IT IS A PROP, NOT A FIELD ON `group`, and required rather than defaulted.
 * The card renders whichever week its caller dated it to, and the payload can
 * only resolve one — so a `group.mode` read here showed the CURRENT week's
 * mode against the VIEWED week's date, announcing "Online this week" over an
 * evening three weeks earlier and hiding that evening's room. One mode in, for
 * the one session this card describes; picking it is the caller's job, because
 * only the caller knows which week it is drawing (`OverviewGroup.sessionModes`
 * is the map they pick from).
 *
 *   · `"virtual"`  → the joining link, and NO location line.
 *   · `"in-person"`→ the room, and NO join button, even when a link is stored
 *                    (every group with a standing link would otherwise offer
 *                    one on the night everybody is meant to turn up).
 *   · `null`       → nothing set for this week: show whatever the slot carries,
 *                    byte-identical to the pre-V2-3 card.
 *
 * HONEST FALLBACKS, both directions. An online week with no stored link and an
 * in-person week with no room each say so in a sentence a member can act on
 * rather than rendering an empty card that reads as "there is nowhere to be".
 * The online one says the link will be HERE, never that anybody will send it:
 * the link lives on the site, behind sign-in, and no email carries it (Q23).
 * The `meetingUrl` PII gate is upstream and untouched: `null` here can also
 * mean "not yours to see", and the fallback copy is written so it is true
 * either way.
 *
 * "Join online" carries the board's line under it (wk-changes): the link is
 * here, not in your emails, so it can't be forwarded.
 */

type SessionState = "upcoming" | "today" | "held";

type Props = {
  group: OverviewGroup;
  /**
   * The civil date the viewed slot began (`CurrentWeek.slotStartKey`). `null`
   * on a run with no usable start date — the card then falls back to the
   * recurring label and stays stateless rather than inventing a date.
   */
  slotStartKey: string | null;
  /**
   * How the session this card is dated to meets. `null` = nothing set for that
   * week; the card shows whatever the slot carries. REQUIRED, so that adding a
   * caller is a decision about which week it is showing rather than a silent
   * fall-through to the legacy state (see the header).
   */
  mode: GroupSessionMode | null;
  title?: string;
  /**
   * The session this card is dated to was cancelled and the group kept pace
   * (Q25): the card says so, with the reason the group was given, and offers
   * no room and no link for an evening nobody meets.
   */
  cancelled?: { reason: string } | null;
};

const WALL_CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

type SessionWindow = { dateKey: string; startsAt: Date; endsAt: Date };

function sessionWindow(group: OverviewGroup, slotStartKey: string | null): SessionWindow | null {
  if (!slotStartKey || !isValidDateKey(slotStartKey)) return null;
  if (!WALL_CLOCK.test(group.startTimeLocal)) return null;
  // Date keys parse at UTC midnight, so `getUTCDay()` reads the civil weekday
  // with no zone in play — the same convention `GroupSession.weekday` uses.
  const slotWeekday = new Date(`${slotStartKey}T00:00:00Z`).getUTCDay();
  const dateKey = addDaysToKey(slotStartKey, (group.weekday - slotWeekday + 7) % 7);
  const startsAt = londonWallClockToInstant(dateKey, group.startTimeLocal);
  const endsAt = new Date(
    startsAt.getTime() + Math.max(0, group.durationMinutes) * 60_000,
  );
  return { dateKey, startsAt, endsAt };
}

/**
 * Held wins over today: a Tuesday-evening group read on Tuesday night has
 * already met, and "Today" over a session that finished two hours ago is the
 * one state that would actively mislead someone into turning up.
 */
function sessionState(occurrence: SessionWindow | null, now: Date): SessionState {
  if (!occurrence) return "upcoming";
  if (now.getTime() >= occurrence.endsAt.getTime()) return "held";
  return londonDateKey(now) === occurrence.dateKey ? "today" : "upcoming";
}

function facilitatorLine(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `with ${names[0]}`;
  return `with ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export default function SessionCard({
  group,
  slotStartKey,
  mode,
  title = "This week's session",
  cancelled = null,
}: Props) {
  const occurrence = sessionWindow(group, slotStartKey);
  const state = sessionState(occurrence, new Date());

  // With a resolved date the card names the actual evening, "Mon 2 Nov, 5pm
  // to 7pm", in the words the weekly email names it in (`sessionWhenLabel`);
  // without one it names the weekly habit the same way, "Mondays, 5pm to
  // 7pm", rather than guessing a date. The run's recurring label is the last
  // resort, for a slot with no time of day.
  const when = sessionWhenLabel(group, occurrence?.dateKey ?? null) || group.sessionLabel;

  // Meeting links are facilitator-authored. `validateSubmissionUrl` is the
  // same gate `GroupEditor` applies on save, re-applied at render so a link
  // stored before that validator existed can't put a `javascript:` URL behind
  // a button.
  const meetingUrl =
    group.meetingUrl &&
    !validateSubmissionUrl(group.meetingUrl, GROUP_FIELD_LIMITS.meetingUrl)
      ? group.meetingUrl
      : null;

  const facilitators = facilitatorLine(group.facilitatorNames);

  // THE SWAP. `mode` decides which of the two destinations this week HAS; the
  // stored values decide whether it can be shown. Keeping the two questions
  // apart is what makes the fallbacks honest rather than blank.
  const showLocation = mode !== "virtual" && Boolean(group.location);
  const showJoin = mode !== "in-person" && Boolean(meetingUrl);
  // Never a promise that the link will come by email (Q23): it is on the
  // site only, so the card says where it will be.
  const missing = cancelled
    ? null
    : mode === "virtual" && !meetingUrl
      ? `Online this week. ${LINK_WILL_BE_HERE}`
      : mode === "in-person" && !group.location
        ? "In person this week — your facilitator will confirm the room."
        : null;

  return (
    <Card
      as="section"
      padding="md"
      // Addressed by the browser end-to-end suite, which checks the group page
      // renders the session beside the roster and the register.
      data-testid="session-card"
      className={[styles.card, styles[state]].join(" ")}
    >
      <div className={styles.head}>
        <h3 className={styles.title}>{title}</h3>
        {state === "today" && <Chip tone="accent" size="sm">Today</Chip>}
      </div>

      <p className={styles.group}>
        {group.name}
        {facilitators && <span className={styles.facilitators}> {facilitators}</span>}
      </p>

      {when && <p className={styles.when}>{when}</p>}
      {/* The mode chip is the DISCLOSURE: a week that has swapped says so in a
          word, so a member who remembers a room does not have to work out why
          it has gone. Nothing is shown when no mode is set — an unswitched
          week must read exactly as it did before. */}
      {cancelled && (
        <>
          <p className={styles.mode}>
            <Chip tone="neutral" size="sm">
              {CANCELLED_CARD}
            </Chip>
          </p>
          {cancelled.reason && <p className={styles.note}>{cancelled.reason}</p>}
        </>
      )}
      {!cancelled && mode !== null && (
        <p className={styles.mode}>
          <Chip tone={mode === "virtual" ? "accent" : "neutral"} size="sm">
            {mode === "virtual" ? "Online this week" : "In person this week"}
          </Chip>
        </p>
      )}
      {/* A cancelled evening offers neither a room nor a link. */}
      {!cancelled && showLocation && <p className={styles.location}>{group.location}</p>}
      {missing && <p className={styles.note}>{missing}</p>}

      {!cancelled && state === "held" && (
        <p className={styles.note}>This week&apos;s session has happened.</p>
      )}

      {!cancelled && showJoin && meetingUrl && (
        <>
          {/* <Button> renders a real <button> and takes no href, so a
              navigation target gets the styling rather than the component
              (the CourseCTA call). */}
          <a
            className={styles.button}
            href={meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {JOIN_ONLINE}
          </a>
          <p className={styles.note}>{LINK_IS_HERE}</p>
        </>
      )}
    </Card>
  );
}
