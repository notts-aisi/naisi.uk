"use client";

import Link from "next/link";
import { useId, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import CountedTextarea from "@/components/ui/CountedTextarea";
import { Field, Input } from "@/components/ui/Input";
import PersonSelector from "@/components/ui/PersonSelector";
import Select from "@/components/ui/Select";
import Switch from "@/components/ui/Switch";
import type { UserDoc } from "@/lib/firestore/users";
import { GROUP_CAMPUSES, campusLabel, campusOf, type GroupCampus } from "@/lib/courses/campus";
import { CAMPUS, CAMPUS_HINT, CAMPUS_LABEL, CAMPUS_NOT_CHOSEN } from "@/lib/courses/campusWords";
import { NEW_GROUP_SESSION_MINUTES } from "@/lib/courses/sessionLength";
import {
  LINK_SET,
  NONE_SET,
  NOT_SET_YET,
  SLOT_NO_PAGE_LINE,
  SLOT_READ_ONLY_LABEL,
  SLOT_READ_ONLY_LINE,
  changeOnGroupPageWords,
  dayAndTimeWords,
  goneOutSinceOpened,
  lengthLine,
  roomLine,
} from "@/lib/courses/groupPage/words";
import {
  CAMPUS_AND_LOCATION,
  MEETING_LINK,
  ONLY_AN_ADMIN_HERE,
  archiveOnGroupPageWords,
  openGroupPageWords,
} from "@/lib/courses/olderEditor/words";
import { placesWords } from "@/lib/courses/placesAndName/words";
import { ARCHIVE_IS_AN_ADMINS } from "@/lib/courses/groupArchive/words";
import {
  validateSubmissionUrl,
  type CourseEnrolMode,
} from "@/lib/firestore/courses";
import {
  GROUP_FIELD_LIMITS,
  MAX_OPEN_MODE_CAPACITY,
  groupCapacityError,
  type CourseGroupDoc,
  type GroupSession,
} from "@/lib/firestore/courseGroups";
import {
  createGroup,
  setGroupArchived,
  setGroupFacilitators,
  updateGroup,
} from "./courseMutations";
import SessionSlotField from "./SessionSlotField";
import styles from "./GroupEditor.module.css";

/**
 * One group's card in the run editor, plus the inline "new group" form.
 *
 * Two write paths, deliberately: the content fields (name, capacity, session,
 * campus) go client-direct through `updateGroup` because the rules express that
 * invariant exactly, while `facilitatorUids` is server-owned and pinned in
 * rules — assigning a facilitator also upserts a `role:"facilitator"`
 * enrolment, which no client write can do. The card saves both in one gesture
 * and lets the toast report whichever half fails.
 *
 * The Archived switch is a route too (`setGroupArchived`), and `archived` is
 * pinned in rules: archiving is refused while it would lose something, and a
 * refusal's one sentence is what the toast shows, as for a failed save.
 *
 * ON A RUN A PROGRAMME NAMES (`groupPageHref` set), the group's page under
 * that programme is where its room, campus and meeting link change, with
 * History, and where it is archived and restored. Here the three are words
 * with the way there, the card's save never sends them (so a card left open
 * cannot put back a room changed on that page), and the Archived switch is a
 * sentence and a link. On a run no programme names the card is as it was,
 * except that the room, campus and link are an admin's: firestore.rules
 * keeps them from every other browser writer, so for anybody else they are
 * words too. Either way the card sends the three only when they changed.
 *
 * THE NAME AND THE CAPACITY follow the room exactly. On a run a programme
 * names they are words with "Change it on Group C's page", where the places
 * and name routes check them (places never below the people in the group)
 * and write History, and the save never sends them, for an admin too. On a
 * run no programme names they stay fields for an admin, unchecked against
 * the people in the group and writing no History, as before; for anybody
 * else they are words, since firestore.rules keeps both from every browser
 * writer but an admin.
 */

type ToastRun = (
  action: () => Promise<void>,
  opts?: { savingMessage?: string; successMessage?: string },
) => Promise<void>;


/** A sensible first slot for a brand-new group: Tuesday evening, 90 minutes. */
const DEFAULT_SESSION: GroupSession = {
  weekday: 2,
  startTimeLocal: "18:00",
  durationMinutes: NEW_GROUP_SESSION_MINUTES,
  location: "",
  meetingUrl: null,
  notes: "",
};

/**
 * What "capacity" means differs by run, so the hint does too. An admissions
 * run is placed by a human who can see the size of each group, so a blank cap
 * is legitimate; an open run fills itself, and a group that fills past the
 * register ceiling makes bulk marking fail for everybody in it.
 */
const CAPACITY_HINT: Record<CourseEnrolMode, string> = {
  admissions: "Leave blank for no cap.",
  open: `Required on an open-enrolment run, at most ${MAX_OPEN_MODE_CAPACITY}.`,
};

function sameUids(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((uid, i) => uid === b[i]);
}

/** "" → null, and never `undefined` — Firestore rejects it outright. */
function capacityFromInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

type Props = {
  group: CourseGroupDoc;
  members: UserDoc[];
  /**
   * The PARENT RUN's enrolment mode. Not on the group document and it cannot
   * be: the capacity rule is a two-document rule, and this component is the
   * only place that already holds both halves. See `groupCapacityError`.
   */
  enrolMode: CourseEnrolMode;
  runAction: ToastRun;
  onSaved: () => void;
  disabled?: boolean;
  /**
   * The run's groups have gone out (Publish has sent them). The day, time
   * and length are then words with the way to the group's own page, and are
   * never written from here, so a card left open cannot put back a time
   * changed on that page meanwhile. Every other field stays.
   */
  goneOut?: boolean;
  /** The group's own page under its programme's Groups tab; null when no programme names the run. */
  groupPageHref?: string | null;
  /**
   * An admin, whom the archive route admits from here. A course drafter and
   * a course approver reach this card too; for them the switch is disabled
   * and a line says who archives a group.
   */
  canArchive?: boolean;
  /** An admin: on a run no programme names, the only writer of the room, campus and link from here. */
  isAdmin?: boolean;
};

export default function GroupEditor({
  group,
  members,
  enrolMode,
  runAction,
  onSaved,
  disabled,
  goneOut = false,
  groupPageHref = null,
  canArchive = true,
  isAdmin = false,
}: Props) {
  const fieldId = useId();
  // The room, the campus and the link are fields only for an admin on a run
  // no programme names; everywhere else they are words.
  const roomEditable = groupPageHref === null && isAdmin;
  // The name and the capacity likewise: on a run a programme names they are
  // changed on the group's page, with its checks and History; firestore.rules
  // keeps them from every browser writer but an admin.
  const nameAndPlacesEditable = roomEditable;
  const groupName = group.name || "the group";

  const [name, setName] = useState(group.name);
  const [capacity, setCapacity] = useState(
    group.capacity === null ? "" : String(group.capacity),
  );
  const [session, setSession] = useState<GroupSession>(group.session);
  const [campus, setCampus] = useState<GroupCampus | null>(group.campus);
  const [facilitatorUids, setFacilitatorUids] = useState<string[]>(
    group.facilitatorUids,
  );
  const [error, setError] = useState<string | null>(null);
  const [syncedGroup, setSyncedGroup] = useState<CourseGroupDoc>(group);

  // Reseed from the saved doc whenever it changes identity (a reload after a
  // save). Adjusted during render rather than in an effect, per the React docs
  // and TimeField's precedent. One-shot reads, so there is no listener to race
  // a live edit.
  if (group !== syncedGroup) {
    setSyncedGroup(group);
    setName(group.name);
    setCapacity(group.capacity === null ? "" : String(group.capacity));
    setSession(group.session);
    setCampus(group.campus);
    setFacilitatorUids(group.facilitatorUids);
    setError(null);
  }

  const meetingUrlValue = session.meetingUrl ?? "";

  async function save() {
    const trimmedName = name.trim();
    if (nameAndPlacesEditable && !trimmedName) {
      setError("Give the group a name.");
      return;
    }
    const url = meetingUrlValue.trim();
    if (roomEditable && url) {
      const urlError = validateSubmissionUrl(url, GROUP_FIELD_LIMITS.meetingUrl);
      if (urlError) {
        setError(urlError);
        return;
      }
    }
    // Checked here so an open-mode group missing its capacity reads a sentence
    // instead of a permission-denied: firestore.rules refuses this exact write
    // and has no way to say why.
    const nextCapacity = capacityFromInput(capacity);
    const capacityError = nameAndPlacesEditable ? groupCapacityError(nextCapacity, enrolMode) : null;
    if (capacityError) {
      setError(capacityError);
      return;
    }
    setError(null);
    // The name and the capacity, only when this card may change them and they
    // did change: a save that leaves them alone never sends them, so it never
    // puts back a name or a number changed on the group's page meanwhile.
    const nameChanged = nameAndPlacesEditable && trimmedName !== group.name;
    const capacityChanged = nameAndPlacesEditable && nextCapacity !== group.capacity;

    const nextLocation = session.location.trim();
    // Empty stays null rather than "": `meetingUrl` is nullable by design
    // and the group card renders "in person only" off exactly that null.
    const nextMeetingUrl = url ? url : null;
    // The room, the link and the campus, only when this card may change them
    // and they did change: a save that leaves them alone never sends them,
    // so it never puts back what the group's page has set meanwhile.
    const roomChanged = roomEditable && nextLocation !== group.session.location;
    const linkChanged = roomEditable && nextMeetingUrl !== group.session.meetingUrl;
    const campusChanged = roomEditable && campus !== group.campus;
    const nextSession: Partial<GroupSession> = {
      // Once the groups have gone out the slot is the group page's: only the
      // fields this card still edits are written (dotted paths, `updateGroup`).
      ...(goneOut
        ? {}
        : {
            weekday: session.weekday,
            startTimeLocal: session.startTimeLocal,
            durationMinutes: session.durationMinutes,
          }),
      ...(roomChanged ? { location: nextLocation } : {}),
      ...(linkChanged ? { meetingUrl: nextMeetingUrl } : {}),
      notes: session.notes.trim(),
    };
    const facilitatorsChanged = !sameUids(facilitatorUids, group.facilitatorUids);
    // A card opened before the groups went out still offers the day, time
    // and length; the rules refuse a change once they have, and the toast
    // says why.
    const slotChanged =
      !goneOut
      && (session.weekday !== group.session.weekday
        || session.startTimeLocal !== group.session.startTimeLocal
        || session.durationMinutes !== group.session.durationMinutes);

    let ok = false;
    await runAction(
      async () => {
        try {
          await updateGroup(
            group.id,
            {
              ...(nameChanged ? { name: trimmedName } : {}),
              ...(capacityChanged ? { capacity: nextCapacity } : {}),
              session: nextSession,
              ...(campusChanged ? { campus } : {}),
            },
            enrolMode,
          );
        } catch (err) {
          throw goneOutSinceOpened(err, slotChanged);
        }
        if (facilitatorsChanged) {
          await setGroupFacilitators(group.id, facilitatorUids);
        }
        ok = true;
      },
      {
        savingMessage: "Saving group…",
        successMessage: "Group saved",
      },
    );
    if (ok) onSaved();
  }

  async function toggleArchived(next: boolean) {
    let ok = false;
    await runAction(
      async () => {
        await setGroupArchived(group.id, next);
        ok = true;
      },
      {
        savingMessage: next ? "Archiving group…" : "Restoring group…",
        successMessage: next ? "Group archived" : "Group restored",
      },
    );
    if (ok) onSaved();
  }

  return (
    <Card padding="md" className={group.archived ? styles.archivedCard : undefined}>
      <div className={styles.header}>
        <h4 className={styles.groupName}>{group.name || "Untitled group"}</h4>
        <div className={styles.headerMeta}>
          {group.archived && <Badge tone="neutral">Archived</Badge>}
          <Badge tone={group.memberCount > 0 ? "accent" : "neutral"}>
            {group.memberCount}
            {group.capacity !== null ? `/${group.capacity}` : ""} placed
          </Badge>
        </div>
      </div>

      <div className={styles.fields}>
        {nameAndPlacesEditable ? (
          <div className={styles.twoCol}>
            <Field id={`${fieldId}-name`} label="Group name">
              <Input
                id={`${fieldId}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={GROUP_FIELD_LIMITS.name}
                disabled={disabled}
                placeholder="e.g. Tuesday evening"
              />
            </Field>
            <Field
              id={`${fieldId}-capacity`}
              label="Capacity"
              hint={CAPACITY_HINT[enrolMode]}
            >
              <Input
                id={`${fieldId}-capacity`}
                type="number"
                min={1}
                max={MAX_OPEN_MODE_CAPACITY}
                inputMode="numeric"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                disabled={disabled}
                placeholder="e.g. 8"
              />
            </Field>
          </div>
        ) : (
          <>
            <div className={styles.readOnlySlot}>
              <p className={styles.readOnlyLabel}>Group name</p>
              <p className={styles.readOnlyValue}>{group.name || "Untitled group"}</p>
              <p className={styles.readOnlyHint}>
                {groupPageHref ? (
                  <Link href={groupPageHref} className={styles.readOnlyLink}>
                    {changeOnGroupPageWords(groupName)}
                  </Link>
                ) : (
                  ONLY_AN_ADMIN_HERE
                )}
              </p>
            </div>
            <div className={styles.readOnlySlot}>
              <p className={styles.readOnlyLabel}>Capacity</p>
              <p className={styles.readOnlyValue}>{placesWords(group.capacity)}</p>
              <p className={styles.readOnlyHint}>
                {groupPageHref ? (
                  <Link href={groupPageHref} className={styles.readOnlyLink}>
                    {changeOnGroupPageWords(groupName)}
                  </Link>
                ) : (
                  ONLY_AN_ADMIN_HERE
                )}
              </p>
            </div>
          </>
        )}

        {goneOut ? (
          <div className={styles.readOnlySlot}>
            <p className={styles.readOnlyLabel}>{SLOT_READ_ONLY_LABEL}</p>
            <p className={styles.readOnlyValue}>
              {[dayAndTimeWords(group.session.weekday, group.session.startTimeLocal, group.session.durationMinutes), lengthLine(group.session.durationMinutes)]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className={styles.readOnlyHint}>
              {groupPageHref ? SLOT_READ_ONLY_LINE : SLOT_NO_PAGE_LINE}
              {groupPageHref && (
                <>
                  {" "}
                  <Link href={groupPageHref} className={styles.readOnlyLink}>
                    {changeOnGroupPageWords(groupName)}
                  </Link>
                </>
              )}
            </p>
          </div>
        ) : (
          <SessionSlotField
            value={session}
            onChange={(next) => setSession({ ...session, ...next })}
            disabled={disabled}
          />
        )}

        {roomEditable ? (
          <>
            <Field id={`${fieldId}-campus`} label={CAMPUS} hint={CAMPUS_HINT}>
              <Select
                id={`${fieldId}-campus`}
                value={campus ?? ""}
                onChange={(e) => setCampus(campusOf(e.target.value))}
                disabled={disabled}
              >
                <option value="">{CAMPUS_NOT_CHOSEN}</option>
                {GROUP_CAMPUSES.map((each) => (
                  <option key={each} value={each}>
                    {CAMPUS_LABEL[each]}
                  </option>
                ))}
              </Select>
            </Field>

            <div className={styles.twoCol}>
              <Field id={`${fieldId}-location`} label="Location">
                <Input
                  id={`${fieldId}-location`}
                  value={session.location}
                  onChange={(e) =>
                    setSession({ ...session, location: e.target.value })
                  }
                  maxLength={GROUP_FIELD_LIMITS.location}
                  disabled={disabled}
                  placeholder="e.g. Portland A21"
                />
              </Field>
              <Field
                id={`${fieldId}-meeting`}
                label="Meeting link"
                hint="Members only see this via their own group card."
              >
                <Input
                  id={`${fieldId}-meeting`}
                  value={meetingUrlValue}
                  onChange={(e) =>
                    setSession({ ...session, meetingUrl: e.target.value })
                  }
                  maxLength={GROUP_FIELD_LIMITS.meetingUrl}
                  disabled={disabled}
                  placeholder="https://…"
                />
              </Field>
            </div>
          </>
        ) : (
          <>
            <div className={styles.readOnlySlot}>
              <p className={styles.readOnlyLabel}>{CAMPUS_AND_LOCATION}</p>
              <p className={styles.readOnlyValue}>
                {group.session.location.trim() || group.campus
                  ? roomLine(group.session.location, campusLabel(group.campus))
                  : NOT_SET_YET}
              </p>
              <p className={styles.readOnlyHint}>
                {groupPageHref ? (
                  <Link href={groupPageHref} className={styles.readOnlyLink}>
                    {changeOnGroupPageWords(groupName)}
                  </Link>
                ) : (
                  ONLY_AN_ADMIN_HERE
                )}
              </p>
            </div>
            <div className={styles.readOnlySlot}>
              <p className={styles.readOnlyLabel}>{MEETING_LINK}</p>
              <p className={styles.readOnlyValue}>{group.session.meetingUrl ? LINK_SET : NONE_SET}</p>
              <p className={styles.readOnlyHint}>
                {groupPageHref ? (
                  <Link href={groupPageHref} className={styles.readOnlyLink}>
                    {changeOnGroupPageWords(groupName)}
                  </Link>
                ) : (
                  ONLY_AN_ADMIN_HERE
                )}
              </p>
            </div>
          </>
        )}

        <Field
          id={`${fieldId}-notes`}
          label="Session notes"
          hint="Anything the group needs to know about how the session runs."
        >
          <CountedTextarea
            id={`${fieldId}-notes`}
            value={session.notes}
            max={GROUP_FIELD_LIMITS.notes}
            onChange={(e) => setSession({ ...session, notes: e.target.value })}
            disabled={disabled}
            rows={2}
          />
        </Field>

        <PersonSelector
          users={members}
          selected={facilitatorUids}
          onChange={setFacilitatorUids}
          label="Facilitators"
          role="facilitator"
          max={GROUP_FIELD_LIMITS.maxFacilitators}
        />

        {groupPageHref ? (
          <p className={styles.readOnlyHint}>
            {archiveOnGroupPageWords(groupName)}{" "}
            <Link href={groupPageHref} className={styles.readOnlyLink}>
              {openGroupPageWords(groupName)}
            </Link>
          </p>
        ) : (
          <>
            <Switch
              checked={group.archived}
              onChange={toggleArchived}
              disabled={disabled || !canArchive}
              label="Archived"
              description="Archived groups stay on the run for the record but drop out of allocation."
            />
            {!canArchive && <p className={styles.hint}>{ARCHIVE_IS_AN_ADMINS}</p>}
          </>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <Button type="button" onClick={save} disabled={disabled}>
          Save group
        </Button>
      </div>
    </Card>
  );
}

/**
 * Inline "new group" form. Deliberately only asks for the three things a group
 * cannot exist without — everything else is edited on the card once it exists,
 * so creating six groups in a row stays fast.
 */
export function NewGroupForm({
  run,
  runAction,
  onCreated,
  onCancel,
  disabled,
}: {
  run: { id: string; courseId: string; label: string; enrolMode: CourseEnrolMode };
  runAction: ToastRun;
  onCreated: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  const fieldId = useId();
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [session, setSession] = useState<GroupSession>(DEFAULT_SESSION);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the group a name.");
      return;
    }
    // Same check as the card, for the same reason: an open-mode run's group
    // cannot be born uncapped, and the rules cannot say so in words.
    const nextCapacity = capacityFromInput(capacity);
    const capacityError = groupCapacityError(nextCapacity, run.enrolMode);
    if (capacityError) {
      setError(capacityError);
      return;
    }
    setError(null);
    let ok = false;
    await runAction(
      async () => {
        await createGroup(run, {
          name: trimmed,
          capacity: nextCapacity,
          session,
        });
        ok = true;
      },
      { savingMessage: "Creating group…", successMessage: "Group created" },
    );
    if (ok) {
      setName("");
      setCapacity("");
      setSession(DEFAULT_SESSION);
      onCreated();
    }
  }

  return (
    <Card padding="md">
      <h4 className={styles.groupName}>New group</h4>
      <div className={styles.fields}>
        <div className={styles.twoCol}>
          <Field id={`${fieldId}-new-name`} label="Group name">
            <Input
              id={`${fieldId}-new-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={GROUP_FIELD_LIMITS.name}
              disabled={disabled}
              placeholder="e.g. Tuesday evening"
              autoFocus
            />
          </Field>
          <Field
            id={`${fieldId}-new-capacity`}
            label="Capacity"
            hint={CAPACITY_HINT[run.enrolMode]}
          >
            <Input
              id={`${fieldId}-new-capacity`}
              type="number"
              min={1}
              max={MAX_OPEN_MODE_CAPACITY}
              inputMode="numeric"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              disabled={disabled}
              placeholder="e.g. 8"
            />
          </Field>
        </div>

        <SessionSlotField
          value={session}
          onChange={(next) => setSession({ ...session, ...next })}
          disabled={disabled}
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <Button type="button" onClick={create} disabled={disabled}>
          Create group
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={disabled}
        >
          Cancel
        </Button>
      </div>
    </Card>
  );
}
