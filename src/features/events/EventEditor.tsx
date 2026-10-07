"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import DateTimePopover from "@/components/ui/DateTimePopover";
import { Field, Input, Textarea } from "@/components/ui/Input";
import MemberName from "@/components/ui/MemberName";
import Notice from "@/components/ui/Notice";
import OptionRow from "@/components/ui/OptionRow";
import PageHead from "@/components/ui/PageHead";
import Link from "next/link";
import ResponsiveSelect from "@/components/ui/ResponsiveSelect";
import Switch from "@/components/ui/Switch";
import { useAuth } from "@/auth/AuthProvider";
import { getClientDb } from "@/lib/firebase/client";
import {
  COVER_BRANDING_LABEL,
  COVER_LOGO_SCALE_DEFAULT,
  COVER_LOGO_X_DEFAULT,
  COVER_LOGO_Y_DEFAULT,
  COVER_STRIP_SIZE_DEFAULT,
  FOOD_TAGS,
  FOOD_TAG_LABEL,
  FOOD_TEXT_MAX,
  LOCATION_MAX,
  TITLE_MAX,
  normalizeEvent,
  sanitizeSignupForm,
  validateQuestionLimits,
  type CoverBranding,
  type CoverLogoColor,
  type CoverLogoPosition,
  type EventDoc,
  type EventVisibility,
  type FoodTag,
  type FormQuestion,
} from "@/lib/firestore/events";
import type { Block } from "@/lib/firestore/newsletterBlocks";
import type { EventChange } from "@/lib/events/changeSummary";
import {
  locationWithheld,
  publicLocationLine,
  publicLocationText,
} from "@/lib/events/location";
import { canApproveEvent, canDraftEvent } from "@/lib/firestore/users";
import BlockEditor from "@/components/blocks/BlockEditor";
import ImageUpload from "@/components/blocks/ImageUpload";
import {
  approveEvent,
  deleteEvent,
  rejectEvent,
  revertEventToDraft,
  submitEventForReview,
  updateEvent,
} from "./eventMutations";
import CollaboratorPicker from "./CollaboratorPicker";
import CoverBrandingModal from "./CoverBrandingModal";
import StepRail, { type EditorStep } from "./EditorSteps";
import FormBuilder from "./FormBuilder";
import {
  STATUS_WORDS,
  dayWords,
  stampWords,
  statusTone,
  timeRangeWords,
  whenWords,
} from "./manageWords";
import styles from "./EventEditor.module.css";

type Props = {
  eventId: string;
  /**
   * Whether publishing QUEUES the announcement rather than sending it inside
   * the request. Read from `config/scheduler` by the page above, because that
   * document is closed to every client; see
   * `src/lib/scheduler/announcementQueue.ts`. It changes one sentence of the
   * Publish confirm and nothing else: the server decides the path either way.
   */
  announcementsQueued?: boolean;
};

/**
 * The editor's four steps. They are a way of looking at one form: every field
 * lives in the editor whichever step is showing, and nothing is saved by
 * moving between them.
 */
type StepKey = "basics" | "details" | "signup" | "send";

/** What `POST /api/events/[id]/publish` answers. Counts only, never addresses. */
type PublishResponse = {
  ok?: true;
  error?: string;
  /** Whether anybody was actually told, not whether the attempt ran. */
  announced?: boolean;
  /** The send threw. The event is published; nobody was told. */
  announcementFailed?: boolean;
  /** The send refused before dispatching. The claim was handed back. */
  announcementRefused?: boolean;
  /**
   * The `event-announcements` job is switched on, so nothing was sent inside
   * the request: the announcement is queued and the next scheduler run
   * delivers it. From then on the event DOCUMENT is what says how it went, and
   * this editor reads it through the listener it already has.
   */
  announcementQueued?: boolean;
  announcement?: {
    sent?: number;
    pushed?: number;
    failed?: number;
    refusal?: string | null;
    /** The push leg's own refusal. The two legs fail independently. */
    pushRefusal?: string | null;
  };
};

/**
 * WHAT THE PUBLISHER IS TOLD ABOUT THE ANNOUNCEMENT, or null when there is
 * nothing to say (a republish, or an empty list).
 *
 * Publishing an event for the first time mails everyone subscribed to event
 * announcements, from inside the publish request, so it has three outcomes the
 * publisher cannot see anywhere else: it reached N people, it was refused
 * because the list is over the ceiling, or it failed outright. In each of the
 * last two the event IS live and nobody heard about it. A screen that answers
 * only "published" would leave that invisible until somebody asked why the
 * event was quiet.
 */
function announcementLine(body: PublishResponse): string | null {
  if (body.announcementQueued) {
    // NOT an outcome, and worded so it does not read as one. Nobody has been
    // told yet; the announcement card below reports what the job then does.
    return (
      "Published. The announcement is queued and goes out with the next " +
      "scheduler run, usually within fifteen minutes."
    );
  }
  if (body.announcementFailed) {
    return (
      "The event is published, but the announcement did not go out. " +
      "Ask an admin to check the send log."
    );
  }
  const refusal = body.announcement?.refusal ?? null;
  // The push leg's refusal is reported wherever the email leg's is, and never
  // folded into it. The legs fail independently, so "the list is over the
  // ceiling" and "nobody could be notified" are two different sentences and a
  // publisher who is shown one of them has not been told the other.
  const pushRefusal = body.announcement?.pushRefusal ?? null;
  const trailer = [refusal, pushRefusal].filter(Boolean).join(" ");
  if (body.announcementRefused) {
    const said = trailer || "The announcement was not sent.";
    return `The event is published. ${said}`;
  }
  if (!body.announced) {
    // NOTHING WAS ANNOUNCED, AND A LEG STILL HAS SOMETHING TO SAY. A publish
    // whose events list is empty announces nothing and refuses nothing, which
    // is a silence worth no words; but the push leg can refuse (over the device
    // ceiling, or a collection it could not read) while the email leg simply
    // had nobody to write to, and that publisher would otherwise be shown
    // nothing at all about a leg that failed. The trailer is checked BEFORE
    // this return for exactly that case.
    return trailer ? `The event is published. ${trailer}` : null;
  }
  const sent = body.announcement?.sent ?? 0;
  const pushed = body.announcement?.pushed ?? 0;
  const parts = [`${sent} ${sent === 1 ? "email" : "emails"}`];
  if (pushed > 0) {
    parts.push(`${pushed} ${pushed === 1 ? "notification" : "notifications"}`);
  }
  const line = `Published, and announced to the events list: ${parts.join(" and ")}.`;
  return trailer ? `${line} ${trailer}` : line;
}

/**
 * WHAT THE QUEUED ANNOUNCEMENT IS DOING, read off the event document.
 *
 * The publish response can only ever say "queued": everything after that
 * happens on a scheduler tick, minutes later, with nobody's browser watching.
 * So the job writes its state and its running totals back onto the event, and
 * this reads them. No new listener is needed and none is added: the editor
 * already holds an `onSnapshot` on this document for every other field, so the
 * card updates itself as the job works through the list.
 *
 * Returns null for an event announced inline or never announced, which is
 * every event on an environment where the job is switched off.
 */
function queuedAnnouncementLine(event: EventDoc): string | null {
  const state = event.announcementState ?? null;
  if (state === null) return null;
  const result = event.announcementResult ?? null;
  const sent = result?.sent ?? 0;
  const pushed = result?.pushed ?? 0;
  // The audience-level drops and the per-recipient ones are two counters for
  // two reasons (one is a snapshot, one accumulates); to a reader they are one
  // number, so they are added here rather than explained on screen.
  const skipped = (result?.skipped ?? 0) + (result?.audienceSkipped ?? 0);

  if (state === "queued") {
    // NAMES THE CONDITION. The queue only drains while the job is switched on,
    // and an admin who turns it off leaves this event sitting here; a line
    // promising "the next scheduler run" with no such run coming would be the
    // screen lying about a thing only an admin can see.
    return (
      "The announcement is queued for the event-announcements scheduler job and " +
      "goes out on its next run, usually within fifteen minutes, while that job " +
      "is switched on."
    );
  }
  if (state === "sending") {
    // The totals are persisted at the end of every tick, so "so far" is
    // literally true rather than a hedge: it is what the last completed tick
    // had done.
    const counts = `${sent} ${sent === 1 ? "email" : "emails"} and ${pushed} ${
      pushed === 1 ? "notification" : "notifications"
    }`;
    return `Announcement in progress: ${counts} so far.`;
  }
  if (state === "refused") {
    const said = result?.refusal ?? "The announcement was not sent.";
    // READ OFF THE DOCUMENT, never derived from the counts. Both refusals
    // reach nobody, and only one of them hands the claim back: an audience
    // that could not be read can be tried again, and an event that has already
    // started cannot. Deriving this from "nothing was sent" told an approver
    // to republish a past event and let them watch nothing happen.
    const after = result?.released
      ? " The claim was released, so publishing this event again re-queues the announcement."
      : "";
    return `${said}${after}`;
  }
  // Done. The same wording the inline path uses, so the two paths do not read
  // as two different features.
  const trailer = [result?.refusal ?? null, result?.pushRefusal ?? null]
    .filter(Boolean)
    .join(" ");
  const tail = skipped > 0 ? ` ${skipped} skipped.` : "";
  if (sent === 0 && pushed === 0) {
    // A run that finished correctly and told nobody: an empty events list, or
    // every recipient dropped. "0 emails" reads as a fault; this does not.
    const line = "The announcement reached nobody on the events list.";
    return trailer ? `${line} ${trailer}${tail}` : `${line}${tail}`;
  }
  const parts = [`${sent} ${sent === 1 ? "email" : "emails"}`];
  if (pushed > 0) {
    parts.push(`${pushed} ${pushed === 1 ? "notification" : "notifications"}`);
  }
  const line = `Announced to the events list: ${parts.join(" and ")}.`;
  return trailer ? `${line} ${trailer}${tail}` : `${line}${tail}`;
}

/** Local YYYY-MM-DD, used to keep the end-date picker on or after the start day. */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Join label fragments as "a", "a and b", or "a, b and c". */
function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Pre-fill the attendee-notification draft from what an edit changed. The
 * notify-worthy set is date/time, location, and the description, so the
 * pre-filled subject and body reflect any combination of those.
 */
function buildNotifyDraft(
  changes: EventChange[],
  descriptionChanged: boolean,
): {
  subject: string;
  body: string;
} {
  const parts: string[] = [];
  if (changes.some((c) => c.label === "When")) parts.push("time");
  if (changes.some((c) => c.label === "Where")) parts.push("location");
  if (descriptionChanged) parts.push("description");
  const subject = parts.length > 0 ? `Update: ${joinList(parts)}` : "Event update";
  let body =
    "Quick heads-up: we've updated some details for this event. " +
    "What changed is summarised below, with the latest full details underneath.";
  if (descriptionChanged) {
    body +=
      " The event description has changed too, so it's worth a fresh read.";
  }
  body +=
    " Apologies for any inconvenience, and let us know if you can no longer make it.";
  return { subject, body };
}

export default function EventEditor({ eventId, announcementsQueued = false }: Props) {
  const router = useRouter();
  const { user, role, permissions, suRecognised } = useAuth();

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [startAt, setStartAt] = useState<Date | null>(null);
  const [endAt, setEndAt] = useState<Date | null>(null);
  const [location, setLocation] = useState("");
  const [locationHidden, setLocationHidden] = useState(false);
  const [locationPublicText, setLocationPublicText] = useState("");
  const [visibility, setVisibility] = useState<EventVisibility>("public");
  const [capacity, setCapacity] = useState<number | null>(null);
  const [waitlistEnabled, setWaitlistEnabled] = useState(true);
  const [noSignup, setNoSignup] = useState(false);
  const [signupForm, setSignupForm] = useState<FormQuestion[]>([]);
  const [foodText, setFoodText] = useState("");
  const [dietaryTags, setDietaryTags] = useState<FoodTag[]>([]);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [coverBranding, setCoverBranding] = useState<CoverBranding>("none");
  const [coverLogoColor, setCoverLogoColor] = useState<CoverLogoColor>("white");
  const [coverStripSize, setCoverStripSize] = useState(COVER_STRIP_SIZE_DEFAULT);
  const [coverLogoPosition, setCoverLogoPosition] =
    useState<CoverLogoPosition>("bottom");
  const [coverLogoScale, setCoverLogoScale] = useState(COVER_LOGO_SCALE_DEFAULT);
  const [coverLogoX, setCoverLogoX] = useState(COVER_LOGO_X_DEFAULT);
  const [coverLogoY, setCoverLogoY] = useState(COVER_LOGO_Y_DEFAULT);
  const [coverLogoBackdrop, setCoverLogoBackdrop] = useState(true);
  const [coverLogoShadow, setCoverLogoShadow] = useState(true);
  const [brandingModalOpen, setBrandingModalOpen] = useState(false);

  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [publishStatus, setPublishStatus] = useState<
    | { kind: "idle" }
    | { kind: "publishing" }
    | { kind: "error"; message: string }
    // The event IS published and the announcement has something to say about
    // itself: how many it reached, or why it reached nobody. Not an error.
    | { kind: "announced"; message: string }
  >({ kind: "idle" });

  // After editing a published event, offer to email confirmed attendees.
  // The opt-in checkbox by Save gates whether the composer opens at all.
  const [notifyOnSave, setNotifyOnSave] = useState(false);
  const [notifyDraft, setNotifyDraft] = useState<{
    subject: string;
    body: string;
    changes: EventChange[];
    descriptionChanged: boolean;
  } | null>(null);
  const [notifyState, setNotifyState] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent"; sent: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Cancel-with-notify modal. Cancelling sets the event to "cancelled" and,
  // when the tick is on, emails confirmed + waitlisted attendees.
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelNotify, setCancelNotify] = useState(true);
  const [cancelNote, setCancelNote] = useState("");
  const [cancelState, setCancelState] = useState<
    | { kind: "idle" }
    | { kind: "cancelling" }
    | { kind: "done"; notified: boolean; sent: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Which step is showing. Changing it saves nothing and loses nothing: the
  // fields above belong to the editor, and every step stays mounted.
  const [step, setStep] = useState<StepKey>("basics");
  const stepChanged = useRef(false);
  function goTo(next: StepKey) {
    stepChanged.current = true;
    setStep(next);
  }
  // After a move, the new step's heading takes focus, so a keyboard and a
  // screen reader land where the page now is. Not on first load.
  useEffect(() => {
    if (!stepChanged.current) return;
    stepChanged.current = false;
    document.getElementById(`editor-step-${step}`)?.focus();
  }, [step]);

  useEffect(() => {
    const db = getClientDb();
    const unsub = onSnapshot(
      doc(db, "events", eventId),
      (snap) => {
        if (!snap.exists()) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const next = normalizeEvent(snap.id, snap.data());
        setEvent(next);
        setTitle((cur) => (dirty ? cur : next.title));
        setBlocks((cur) => (dirty ? cur : next.blocks));
        setStartAt((cur) => (dirty ? cur : next.startAt));
        setEndAt((cur) => (dirty ? cur : next.endAt));
        setLocation((cur) => (dirty ? cur : next.location));
        setLocationHidden((cur) => (dirty ? cur : next.locationHidden));
        setLocationPublicText((cur) => (dirty ? cur : next.locationPublicText ?? ""));
        setVisibility((cur) => (dirty ? cur : next.visibility));
        setCapacity((cur) => (dirty ? cur : next.capacity));
        setWaitlistEnabled((cur) => (dirty ? cur : next.waitlistEnabled));
        setNoSignup((cur) => (dirty ? cur : next.noSignup));
        setSignupForm((cur) => (dirty ? cur : next.signupForm));
        setFoodText((cur) => (dirty ? cur : next.foodText ?? ""));
        setDietaryTags((cur) => (dirty ? cur : next.dietaryTags ?? []));
        setPosterUrl((cur) => (dirty ? cur : next.posterUrl ?? null));
        setCoverBranding((cur) => (dirty ? cur : next.coverBranding));
        setCoverLogoColor((cur) => (dirty ? cur : next.coverLogoColor));
        setCoverStripSize((cur) => (dirty ? cur : next.coverStripSize));
        setCoverLogoPosition((cur) => (dirty ? cur : next.coverLogoPosition));
        setCoverLogoScale((cur) => (dirty ? cur : next.coverLogoScale));
        setCoverLogoX((cur) => (dirty ? cur : next.coverLogoX));
        setCoverLogoY((cur) => (dirty ? cur : next.coverLogoY));
        setCoverLogoBackdrop((cur) => (dirty ? cur : next.coverLogoBackdrop));
        setCoverLogoShadow((cur) => (dirty ? cur : next.coverLogoShadow));
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      },
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const viewer =
    role && (role === "admin" || role === "committee" || role === "member")
      ? { role, permissions }
      : null;
  const canDraft = viewer ? canDraftEvent(viewer) : false;
  const canApprove = viewer ? canApproveEvent(viewer) : false;

  const isAuthor = !!user && !!event && event.authorUid === user.uid;
  // A collaborator was explicitly added (by the author or an admin) so they
  // can edit this specific event, even without draft/approve permissions.
  const isCollaborator =
    !!user && !!event && (event.collaboratorUids ?? []).includes(user.uid);
  // The "Who can edit this" picker is managed by the author or an admin.
  const canManageCollaborators = isAuthor || role === "admin";
  // Attendee PII is for SU-recognised committee and admins only.
  const canSeeAttendees =
    role === "admin" || (role === "committee" && suRecognised);
  const status = event?.status ?? "draft";
  // Null on every event the queue has never touched, which is all of them
  // wherever the `event-announcements` job is switched off.
  const queuedAnnouncement = event === null ? null : queuedAnnouncementLine(event);
  const editable = useMemo(() => {
    if (!event) return false;
    if (status === "cancelled") return false;
    // Published events stay editable for approvers via the server update route.
    if (status === "published") return canApprove;
    // While an event is under review or approved, only approvers touch it.
    if (status === "pending") return canApprove;
    if (status === "approved") return canApprove;
    // Drafts and returned events: the author, a collaborator, or an approver.
    return isAuthor || isCollaborator || canApprove;
  }, [event, status, canApprove, isAuthor, isCollaborator]);

  // An event can't end before (or exactly when) it starts. This blocks Save and
  // Submit, but never the date fields themselves: an event that somehow holds
  // an invalid end must always be editable back to valid.
  const endBeforeStart = !!(
    startAt &&
    endAt &&
    endAt.getTime() <= startAt.getTime()
  );

  function markDirty() {
    setDirty(true);
  }

  /**
   * Range-check the authored per-question character limits and help text,
   * returning the sentence that names the offending question.
   *
   * Run on both save paths. The published-event route does the same check
   * server-side and answers 400, but a draft is written client-direct through
   * `updateEvent`, which has no route to refuse it: the sanitiser there clamps
   * silently, and an organiser who typed 5000 would get 4000 with no idea. This
   * is what turns that clamp back into a backstop.
   *
   * `clampLimits: false` is what makes the message quotable: it keeps the
   * number as typed instead of the number that would have been stored.
   */
  function signupFormLimitError(): string | null {
    const problem = validateQuestionLimits(
      sanitizeSignupForm(signupForm, { clampLimits: false }),
    );
    return problem ? problem.error : null;
  }

  async function flush() {
    if (!event) return;
    if (!dirty) return;
    const limitProblem = signupFormLimitError();
    if (limitProblem) throw new Error(limitProblem);
    const fields = {
      title,
      blocks,
      startAt,
      endAt,
      location,
      locationHidden,
      locationPublicText: locationHidden ? locationPublicText : null,
      visibility,
      capacity,
      waitlistEnabled: capacity === null ? false : waitlistEnabled,
      noSignup,
      signupForm,
      foodText: foodText.trim() ? foodText : null,
      dietaryTags,
      posterUrl,
      coverBranding,
      coverLogoColor,
      coverStripSize,
      coverLogoPosition,
      coverLogoScale,
      coverLogoX,
      coverLogoY,
      coverLogoBackdrop,
      coverLogoShadow,
    };
    if (status === "published") {
      // Firestore rules block client writes to published events, so go through
      // the server route, which also reports what changed.
      const res = await fetch(`/api/events/${event.id}/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...fields,
          startAt: startAt ? startAt.toISOString() : null,
          endAt: endAt ? endAt.toISOString() : null,
        }),
      });
      const resBody = (await res.json().catch(() => null)) as
        | {
            ok?: true;
            changeSummary?: EventChange[];
            descriptionChanged?: boolean;
            error?: string;
          }
        | null;
      if (!res.ok || !resBody?.ok) {
        throw new Error(resBody?.error ?? `Save failed (${res.status})`);
      }
      // Only open the notify composer when the organiser opted in and there
      // was a notify-worthy change (time, location, or description).
      // Otherwise the save is silent.
      const summary = resBody.changeSummary ?? [];
      const descriptionChanged = resBody.descriptionChanged === true;
      if (notifyOnSave && (summary.length > 0 || descriptionChanged)) {
        setNotifyDraft({
          ...buildNotifyDraft(summary, descriptionChanged),
          changes: summary,
          descriptionChanged,
        });
        setNotifyState({ kind: "idle" });
      }
      setNotifyOnSave(false);
    } else {
      await updateEvent(event.id, fields);
    }
    setDirty(false);
  }

  async function onSave() {
    if (!event) return;
    setBusy(true);
    setError(null);
    try {
      await flush();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSendNotify() {
    if (!event || !notifyDraft) return;
    if (!notifyDraft.subject.trim() || !notifyDraft.body.trim()) {
      setNotifyState({ kind: "error", message: "Add a subject and message before sending." });
      return;
    }
    setNotifyState({ kind: "sending" });
    try {
      const res = await fetch(`/api/events/${event.id}/broadcast`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: notifyDraft.subject,
          body: notifyDraft.body,
          changes: notifyDraft.changes,
          descriptionChanged: notifyDraft.descriptionChanged,
        }),
      });
      const resBody = (await res.json().catch(() => null)) as
        | { ok?: true; sent?: number; error?: string }
        | null;
      if (!res.ok || !resBody?.ok) {
        setNotifyState({
          kind: "error",
          message: resBody?.error ?? `Send failed (${res.status})`,
        });
        return;
      }
      setNotifyState({ kind: "sent", sent: resBody.sent ?? 0 });
    } catch (err) {
      setNotifyState({
        kind: "error",
        message: err instanceof Error ? err.message : "Send failed",
      });
    }
  }

  /**
   * Everything that stops an event being sent for approval, each with the
   * step it is fixed in, in the order the form asks for it.
   *
   * One list for two readers. `validateBeforeSubmit` is its first entry, which
   * is the sentence Send for approval has always refused with; the steps and
   * the last step's list read all of it. A second copy of these rules for the
   * ticks would be two answers to "is anything missing".
   */
  function problemsBeforeSubmit(): { step: StepKey; message: string }[] {
    const found: { step: StepKey; message: string }[] = [];
    const add = (at: StepKey, message: string) => {
      if (!found.some((p) => p.message === message)) found.push({ step: at, message });
    };
    if (!title.trim()) add("basics", "Give the event a title before you send it for approval.");
    if (blocks.length === 0) add("details", "Add a description before you send it for approval.");
    if (!startAt) {
      add("basics", "Pick a start date and time.");
    } else if (endAt && endAt.getTime() <= startAt.getTime()) {
      add("basics", "An event can’t end before it starts.");
    }
    if (!location.trim()) add("basics", "Add a location: a room, a venue or a link.");
    if (locationHidden && !locationPublicText.trim()) {
      add(
        "basics",
        "You’ve hidden the exact location. Say what everyone else sees instead, for example “somewhere on campus”.",
      );
    }
    if (capacity !== null && capacity <= 0) {
      add("signup", "Places must be at least 1, or empty for no limit.");
    }
    for (const q of signupForm) {
      if (!q.label.trim()) {
        add("signup", "Every sign-up question needs its question written in.");
      } else if (q.type === "singleSelect" || q.type === "multiSelect") {
        const cleaned = q.options.map((o) => o.trim()).filter(Boolean);
        if (cleaned.length < 2) add("signup", `“${q.label}” needs at least two options.`);
      }
    }
    const limitProblem = signupFormLimitError();
    if (limitProblem) add("signup", limitProblem);
    return found;
  }

  function validateBeforeSubmit(): string | null {
    return problemsBeforeSubmit()[0]?.message ?? null;
  }

  async function onSubmitForReview() {
    if (!event) return;
    const invalid = validateBeforeSubmit();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await flush();
      await submitEventForReview(event.id);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  async function onApprove() {
    if (!event) return;
    setBusy(true);
    setError(null);
    try {
      await flush();
      await approveEvent(event.id);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  async function onReject() {
    if (!event) return;
    if (!rejectNote.trim()) {
      setError("Say what needs changing, so the person running the event knows.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await rejectEvent(event.id, rejectNote);
      setRejectNote("");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRevertToDraft() {
    if (!event) return;
    setBusy(true);
    setError(null);
    try {
      await revertEventToDraft(event.id);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not revert");
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    if (!event) return;
    // PUBLISHING MAILS THE EVENTS LIST, so the confirm says so. It happens on
    // the FIRST publish only: `announcedAt` is the once-per-event claim the
    // publish route stamps, and an event pulled back to approved and pushed
    // live again announces nothing.
    const willAnnounce = !event.announcedAt;
    // WHICH PATH THIS PUBLISH WILL TAKE is the server's decision, and the
    // switch behind it is closed to clients, so the page reads it and hands it
    // down. The confirm has to say it: an approver who presses Publish and
    // sees no mail for a quarter of an hour would reasonably conclude the
    // announcement had failed.
    const question = willAnnounce
      ? announcementsQueued
        ? "Publish this event? It goes live on the events page, and everyone subscribed " +
          "to event announcements is emailed about it. The announcement is queued and " +
          "goes out with the next scheduler run rather than immediately."
        : "Publish this event? It goes live on the events page, and everyone subscribed " +
          "to event announcements is emailed about it."
      : "Publish this event? It goes live on the events page. The announcement has " +
        "already gone out, so nobody is emailed again.";
    if (!window.confirm(question)) return;
    setPublishStatus({ kind: "publishing" });
    setError(null);
    try {
      const res = await fetch(`/api/events/${event.id}/publish`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as PublishResponse | null;
      if (!res.ok || !body?.ok) {
        setPublishStatus({
          kind: "error",
          message: body?.error ?? `Publish failed (${res.status})`,
        });
        return;
      }
      const line = announcementLine(body);
      setPublishStatus(line ? { kind: "announced", message: line } : { kind: "idle" });
    } catch (err) {
      setPublishStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Publish error",
      });
    }
  }

  function openCancelModal() {
    setCancelNotify(true);
    setCancelNote("");
    setCancelState({ kind: "idle" });
    setCancelOpen(true);
  }

  async function onConfirmCancel() {
    if (!event) return;
    setCancelState({ kind: "cancelling" });
    try {
      const res = await fetch(`/api/events/${event.id}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notify: cancelNotify, note: cancelNote }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: true; notified?: boolean; sent?: number; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setCancelState({
          kind: "error",
          message: body?.error ?? `Cancel failed (${res.status})`,
        });
        return;
      }
      setCancelState({
        kind: "done",
        notified: body.notified ?? false,
        sent: body.sent ?? 0,
      });
    } catch (err) {
      setCancelState({
        kind: "error",
        message: err instanceof Error ? err.message : "Cancel failed",
      });
    }
  }

  async function onArchive() {
    if (!event) return;
    const next = !event.archived;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${event.id}/archive`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archived: next }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: true; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error ?? `Archive failed (${res.status})`);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!event) return;
    if (!window.confirm("Delete this event for good? Every sign-up and its images go too. This can’t be undone.")) return;
    setBusy(true);
    try {
      // deleteEvent now routes through /api/events/[id]/delete, which removes
      // EVERY RSVP (synthetic and real) plus the event's images before deleting
      // the doc. The old best-effort test-rsvps call is gone: it only cleared
      // synthetic rows, so real attendees' details were left stranded.
      await deleteEvent(event.id);
      router.push("/events/manage");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  const crumb = (
    <Link href="/events/manage" className={styles.crumbLink}>
      Manage events
    </Link>
  );

  if (loading) {
    return (
      <div className={styles.editor}>
        <PageHead crumb={crumb} title="Event" description="Loading event…" />
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className={styles.editor}>
        <PageHead
          crumb={crumb}
          title="Event not found"
          description="It may have been deleted."
        />
      </div>
    );
  }

  const locked = !editable || busy;
  const pendingSignups = event.rsvpCountPending ?? 0;
  // What the public page says for the place, worked out where every other
  // surface works it out, from what is in the form right now.
  const where = publicLocationText({ location, locationHidden, locationPublicText });
  const showApprove = canApprove && status === "pending";
  const showPublish = canApprove && status === "approved";
  const showSubmit =
    canDraft && (status === "draft" || status === "rejected") && isAuthor;
  const showRevert = canApprove && (status === "pending" || status === "approved");
  const showCancel = canApprove && status === "published";
  const showArchive = isAuthor || role === "admin";
  const showDelete = (isAuthor || role === "admin") && status !== "published";

  // The four steps. The last one is named for what happens to the event next.
  const problems = problemsBeforeSubmit();
  const missing = (key: StepKey) => problems.some((p) => p.step === key);
  const lastLabel =
    status === "pending"
      ? "Approval"
      : status === "approved"
        ? "Publish"
        : status === "published"
          ? "Published"
          : status === "cancelled"
            ? "Cancelled"
            : "Send for approval";
  const steps: EditorStep<StepKey>[] = [
    { key: "basics", label: "Basics", done: !missing("basics") },
    { key: "details", label: "Details", done: !missing("details") },
    { key: "signup", label: "Sign-up", done: !missing("signup") },
    { key: "send", label: lastLabel, done: status !== "draft" && status !== "rejected" },
  ];
  const at = steps.findIndex((s) => s.key === step);
  const previous = at > 0 ? steps[at - 1] : null;
  const next = at < steps.length - 1 ? steps[at + 1] : null;

  return (
    <div className={styles.editor}>
      <PageHead
        crumb={crumb}
        title={title.trim() || "Untitled event"}
        badges={
          <>
            <Chip tone={statusTone(status)} dot>
              {STATUS_WORDS[status]}
            </Chip>
            {event.archived && <Chip tone="neutral">Archived</Chip>}
          </>
        }
        meta={
          <>
            {dirty && editable ? (
              <span className={styles.unsaved}>Unsaved changes</span>
            ) : (
              event.updatedAt && (
                <span className={styles.saved}>
                  <TickIcon />
                  Saved {stampWords(event.updatedAt)}
                </span>
              )
            )}
            <span>
              {whenWords(startAt)}
              {where ? ` · ${where}` : ""}
            </span>
            <span>
              Run by <MemberName name={event.authorDisplayName} />
            </span>
            {event.publishedAt && <span>Published {dayWords(event.publishedAt)}</span>}
          </>
        }
        actions={
          <>
            <Link
              href={`/events/manage/${event.id}/preview`}
              target="_blank"
              rel="noopener"
              className={styles.buttonLink}
            >
              <Button variant="secondary" tabIndex={-1} trailing={<ExternalIcon />}>
                Preview
              </Button>
            </Link>
            {canSeeAttendees && (
              <Link
                href={`/events/manage/${event.id}/attendees`}
                className={styles.buttonLink}
              >
                <Button variant="secondary" tabIndex={-1}>
                  Attendees
                  {pendingSignups > 0 && ` · ${pendingSignups} waiting`}
                </Button>
              </Link>
            )}
          </>
        }
      />

      {(status === "pending" || status === "approved") && (
        <Notice
          title={status === "pending" ? "Sent for approval." : "Approved. Ready to publish."}
        >
          To try the sign-up from start to finish,{" "}
          <Link
            href={`/events/manage/${event.id}/preview`}
            target="_blank"
            rel="noopener"
            className={styles.inlineLink}
          >
            open the preview
          </Link>{" "}
          and send a test sign-up. It is saved like a real one, so you can check
          what the attendee list shows. Cancel it before the event goes live.
        </Notice>
      )}

      {status === "published" && (
        <Notice title="Published.">
          Live at{" "}
          <Link
            href={`/events/${event.id}`}
            target="_blank"
            rel="noopener"
            className={styles.inlineLink}
          >
            /events/{event.id}
          </Link>
          . Share the link.{editable ? " Changes you save here go live at once." : ""}
        </Notice>
      )}

      {status === "cancelled" && (
        <Notice tone="neutral" title="This event is cancelled.">
          It stays at its link, marked as cancelled, and can no longer be changed.
        </Notice>
      )}

      {status === "rejected" && event.reviewerNotes && (
        <Notice tone="warning" title="Sent back for changes">
          {event.reviewerNotes}
        </Notice>
      )}

      {!editable && status !== "cancelled" && (
        <Notice tone="neutral" role="note">
          {status === "draft" || status === "rejected"
            ? "You can look at this event. The person running it, the people added to it and approvers can change it."
            : "You can look at this event. Once an event has been sent for approval, only an approver can change it."}
        </Notice>
      )}

      {notifyDraft && (
        <Card as="section" padding="lg">
          <h2 className={styles.sectionTitle}>Tell the people coming</h2>
          <p className={styles.sectionHint}>
            You changed a published event. The summary below goes in the email
            as it is; the message is your own note beside it.
          </p>
          {(notifyDraft.changes.length > 0 || notifyDraft.descriptionChanged) && (
            <div className={styles.changeSummary}>
              {notifyDraft.changes.map((c) => (
                <p key={c.label} className={styles.changeRow}>
                  <strong>{c.label}: </strong>
                  <span className={styles.changeOld}>{c.from}</span>
                  <span className={styles.changeArrow}> → </span>
                  <span className={styles.changeNew}>{c.to}</span>
                </p>
              ))}
              {notifyDraft.descriptionChanged && (
                <p className={styles.changeRow}>
                  <strong>Description: </strong>
                  <span className={styles.changeNew}>
                    the event description has been updated
                  </span>
                </p>
              )}
            </div>
          )}
          <div className={styles.fields}>
            <Field id="notify-subject" label="Subject">
              <Input
                id="notify-subject"
                value={notifyDraft.subject}
                onChange={(e) =>
                  setNotifyDraft({ ...notifyDraft, subject: e.target.value })
                }
                maxLength={150}
                disabled={notifyState.kind === "sending"}
              />
            </Field>
            <Field id="notify-body" label="Message">
              <Textarea
                id="notify-body"
                value={notifyDraft.body}
                onChange={(e) =>
                  setNotifyDraft({ ...notifyDraft, body: e.target.value })
                }
                rows={5}
                maxLength={8000}
                disabled={notifyState.kind === "sending"}
              />
            </Field>
          </div>
          {notifyState.kind === "error" && (
            <p className={styles.problem} role="alert">
              {notifyState.message}
            </p>
          )}
          {notifyState.kind === "sent" && (
            <p className={styles.done} role="status">
              Sent to {notifyState.sent} attendee{notifyState.sent === 1 ? "" : "s"}.
            </p>
          )}
          <div className={styles.actions}>
            {notifyState.kind !== "sent" && (
              <Button onClick={onSendNotify} disabled={notifyState.kind === "sending"}>
                {notifyState.kind === "sending" ? "Sending…" : "Send to attendees"}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setNotifyDraft(null);
                setNotifyState({ kind: "idle" });
              }}
              disabled={notifyState.kind === "sending"}
            >
              {notifyState.kind === "sent" ? "Close" : "Don’t send"}
            </Button>
          </div>
        </Card>
      )}

      <StepRail steps={steps} current={step} onSelect={goTo} />

      <div className={styles.columns}>
        <div className={styles.stepColumn}>
          {/* Every step stays on the page and three of them are out of sight.
              Nothing typed, half uploaded or open in a step is lost by
              looking at another one. */}
          <Card padding="lg" className={styles.stepCard}>
            <section hidden={step !== "basics"} aria-labelledby="editor-step-basics">
              <h2 id="editor-step-basics" tabIndex={-1} className={styles.sectionTitle}>
                Basics
              </h2>
              <p className={styles.sectionHint}>What it is, when and where.</p>
              <div className={styles.fields}>
                <Field
                  id="title"
                  label="Event title"
                  hint="Shown on the events list and the event page."
                >
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      markDirty();
                    }}
                    maxLength={TITLE_MAX}
                    disabled={locked}
                    placeholder="e.g. Board games and pizza"
                  />
                </Field>

                <div className={styles.twoCol}>
                  <Field id="start" label="Starts" hint="In your own local time.">
                    <DateTimePopover
                      value={startAt}
                      onChange={(value) => {
                        setStartAt(value);
                        markDirty();
                      }}
                      disabled={locked}
                      placeholder="Pick a start date and time…"
                    />
                  </Field>
                  <Field
                    id="end"
                    label="Ends (optional)"
                    hint="Leave it empty if you’re not sure yet."
                    error={endBeforeStart ? "An event can’t end before it starts" : undefined}
                  >
                    <DateTimePopover
                      value={endAt}
                      onChange={(value) => {
                        setEndAt(value);
                        markDirty();
                      }}
                      disabled={locked}
                      placeholder="Pick an end date and time…"
                      minDate={startAt ? ymd(startAt) : undefined}
                      invalid={endBeforeStart}
                    />
                  </Field>
                </div>

                <Field
                  id="location"
                  label="Location"
                  hint="The room, the venue or a link. Everyone sees it unless you hide it below."
                >
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => {
                      setLocation(e.target.value);
                      markDirty();
                    }}
                    maxLength={LOCATION_MAX}
                    disabled={locked}
                    placeholder="e.g. Pope A17, Jubilee Campus"
                  />
                </Field>

                <Switch
                  checked={locationHidden}
                  onChange={(value) => {
                    setLocationHidden(value);
                    markDirty();
                  }}
                  disabled={locked}
                  label="Hide the exact location"
                  description="Only people with a confirmed place are shown it. Everyone else sees the wording you give below."
                />

                {locationHidden && (
                  <Field
                    id="location-public-text"
                    label="What everyone else sees"
                    hint="The day and time still show."
                  >
                    <Input
                      id="location-public-text"
                      value={locationPublicText}
                      onChange={(e) => {
                        setLocationPublicText(e.target.value);
                        markDirty();
                      }}
                      maxLength={LOCATION_MAX}
                      disabled={locked}
                      placeholder="e.g. somewhere on University Park campus"
                    />
                  </Field>
                )}
              </div>
            </section>

            <section hidden={step !== "details"} aria-labelledby="editor-step-details">
              <h2 id="editor-step-details" tabIndex={-1} className={styles.sectionTitle}>
                Details
              </h2>
              <p className={styles.sectionHint}>
                What people read on the event page, and who helps you plan it.
              </p>

              <div className={styles.part}>
                <h3 className={styles.partTitle}>Cover image</h3>
                <p className={styles.partHint}>
                  Optional. A banner across the top of the public event page.
                </p>
                <ImageUpload
                  draftId={event.id}
                  storagePrefix="event-images"
                  enableCrop
                  // An event stores the image and nothing about it: the event
                  // page reads the event's own title as the image's text. So
                  // the two boxes for words that would be thrown away are not
                  // drawn.
                  hideTextFields
                  currentUrl={posterUrl ?? undefined}
                  onChange={({ url }) => {
                    const value = url || null;
                    // A freshly uploaded or replaced cover: open the branding picker.
                    if (value && value !== posterUrl) setBrandingModalOpen(true);
                    setPosterUrl(value);
                    markDirty();
                  }}
                  disabled={locked}
                />
                {posterUrl && (
                  <button
                    type="button"
                    className={styles.brandingChip}
                    onClick={() => setBrandingModalOpen(true)}
                    disabled={locked}
                  >
                    <span>
                      NAISI logo: <strong>{COVER_BRANDING_LABEL[coverBranding]}</strong>
                    </span>
                    <span className={styles.brandingChange}>Change</span>
                  </button>
                )}
              </div>

              <div className={styles.part}>
                <h3 className={styles.partTitle}>Description</h3>
                <p className={styles.partHint}>
                  What happens, and anything people should bring or know.
                </p>
                <BlockEditor
                  draftId={event.id}
                  storagePrefix="event-images"
                  blocks={blocks}
                  onChange={(value) => {
                    setBlocks(value);
                    markDirty();
                  }}
                  disabled={locked}
                />
              </div>

              <div className={styles.part}>
                <h3 className={styles.partTitle}>Food</h3>
                <p className={styles.partHint}>
                  If there&apos;s food, say what it is in plain words. It shows
                  in its own box on the event page, so nobody misses it.
                </p>
                <div className={styles.fields}>
                  <Field
                    id="food-text"
                    label="What’s the food?"
                    hint="Leave it empty if there’s no food at this event."
                  >
                    <Textarea
                      id="food-text"
                      value={foodText}
                      onChange={(e) => {
                        setFoodText(e.target.value);
                        markDirty();
                      }}
                      rows={2}
                      maxLength={FOOD_TEXT_MAX}
                      disabled={locked}
                      placeholder="e.g. Pizza from the Portland Building, with vegan and halal options"
                    />
                  </Field>

                  <fieldset className={styles.group}>
                    <legend className={styles.groupLabel}>Dietary tags (optional)</legend>
                    <p className={styles.groupHint}>
                      Tick the ones that are true of the food. They show as labels on the event
                      page.
                    </p>
                    <div className={styles.tagRow}>
                      {FOOD_TAGS.map((tag) => (
                        <OptionRow
                          key={tag}
                          checked={dietaryTags.includes(tag)}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setDietaryTags((cur) =>
                              on ? [...cur, tag] : cur.filter((t) => t !== tag),
                            );
                            markDirty();
                          }}
                          disabled={locked}
                        >
                          {FOOD_TAG_LABEL[tag]}
                        </OptionRow>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </div>

              {canManageCollaborators && (
                <div className={styles.part}>
                  <h3 className={styles.partTitle}>Who can edit this</h3>
                  <p className={styles.partHint}>
                    Add committee members so they can help plan and edit this
                    event. They can change it until it has been sent for
                    approval; after that only approvers can. Adding or removing
                    somebody is saved at once.
                  </p>
                  <CollaboratorPicker eventId={event.id} />
                </div>
              )}
            </section>

            <section hidden={step !== "signup"} aria-labelledby="editor-step-signup">
              <h2 id="editor-step-signup" tabIndex={-1} className={styles.sectionTitle}>
                Sign-up
              </h2>
              <p className={styles.sectionHint}>How people get a place and what you ask them.</p>
              <div className={styles.fields}>
                <div className={styles.twoCol}>
                  <Field id="visibility" label="Who can sign up?">
                    <ResponsiveSelect<EventVisibility>
                      value={visibility}
                      onChange={(value) => {
                        setVisibility(value);
                        markDirty();
                      }}
                      options={[
                        { value: "public", label: "Anyone with the link" },
                        { value: "members", label: "Only people with a naisi.uk account" },
                      ]}
                      disabled={locked}
                      ariaLabel="Who can sign up?"
                    />
                  </Field>

                  <Field
                    id="capacity"
                    label="Places (optional)"
                    hint="Leave it empty for no limit."
                  >
                    <Input
                      id="capacity"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={capacity ?? ""}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setCapacity(
                          e.target.value === "" || Number.isNaN(n) ? null : Math.floor(n),
                        );
                        markDirty();
                      }}
                      disabled={locked}
                      placeholder="e.g. 30"
                    />
                  </Field>
                </div>

                {/* For a drop-in: a social, a screening, a stall. The sign-up
                    settings around this are kept as they are and simply not used, so
                    switching back loses nothing. */}
                <Switch
                  checked={noSignup}
                  onChange={(value) => {
                    setNoSignup(value);
                    markDirty();
                  }}
                  disabled={locked}
                  label="No sign-up needed"
                  description="People just turn up. The event page shows no form and offers add to calendar. The places, the waiting list and the questions are kept, and not used while this is on."
                />

                {capacity !== null && (
                  <Switch
                    checked={waitlistEnabled}
                    onChange={(value) => {
                      setWaitlistEnabled(value);
                      markDirty();
                    }}
                    disabled={locked}
                    label="Waiting list when it’s full"
                    description="If someone cancels, the next person on the list gets their place and an email."
                  />
                )}

                <div>
                  <h3 className={styles.partTitle}>Questions</h3>
                  <p className={styles.partHint}>
                    Everyone gives their name and email. Ask anything else here.
                  </p>
                  <FormBuilder
                    questions={signupForm}
                    onChange={(value) => {
                      setSignupForm(value);
                      markDirty();
                    }}
                    disabled={locked}
                  />
                </div>
              </div>
            </section>

            <section hidden={step !== "send"} aria-labelledby="editor-step-send">
              <h2 id="editor-step-send" tabIndex={-1} className={styles.sectionTitle}>
                {lastLabel}
              </h2>
              <p className={styles.sectionHint}>
                {status === "draft" || status === "rejected"
                  ? "Check it over, then send it to an approver. Nothing is public until it has been approved and published."
                  : status === "pending"
                    ? "An approver checks it, then approves it or sends it back."
                    : status === "approved"
                      ? "It’s approved. Publishing puts it on the events page."
                      : status === "published"
                        ? "It’s on the events page."
                        : "It stays at its link, marked as cancelled."}
              </p>

              <dl className={styles.summary}>
                <div>
                  <dt>When</dt>
                  <dd>
                    {startAt
                      ? `${dayWords(startAt)} · ${timeRangeWords(startAt, endAt)}`
                      : "No date yet"}
                  </dd>
                </div>
                <div>
                  <dt>Where</dt>
                  <dd>
                    {publicLocationLine({ location, locationHidden, locationPublicText })}
                    {locationWithheld({ locationHidden }) && (
                      <span className={styles.summaryNote}>
                        The exact location is shown to confirmed places only.
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Sign-up</dt>
                  <dd>
                    {noSignup
                      ? "No sign-up needed. People just turn up."
                      : [
                          capacity === null ? "No limit on places" : `${capacity} places`,
                          capacity !== null && waitlistEnabled ? "waiting list when it’s full" : null,
                          signupForm.length === 0
                            ? "no questions"
                            : `${signupForm.length} question${signupForm.length === 1 ? "" : "s"}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  </dd>
                </div>
                <div>
                  <dt>Who it’s for</dt>
                  <dd>
                    {visibility === "members"
                      ? "People with a naisi.uk account"
                      : "Anyone with the link"}
                  </dd>
                </div>
                <div>
                  <dt>Food</dt>
                  <dd>{foodText.trim() || "None said"}</dd>
                </div>
                <div>
                  <dt>Cover image</dt>
                  <dd>{posterUrl ? "Yes" : "None"}</dd>
                </div>
              </dl>

              {problems.length > 0 && (
                <div className={styles.todo}>
                  <h3 className={styles.partTitle}>Still to do</h3>
                  <ul className={styles.todoList}>
                    {problems.map((p) => (
                      <li key={p.message} className={styles.todoRow}>
                        <span>{p.message}</span>
                        <Button variant="ghost" size="sm" onClick={() => goTo(p.step)}>
                          Go to {steps.find((s) => s.key === p.step)?.label}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {editable && status === "published" && (
                <div className={styles.part}>
                  <OptionRow
                    plain
                    checked={notifyOnSave}
                    onChange={(e) => setNotifyOnSave(e.target.checked)}
                    disabled={busy}
                    description="If you changed the date, the time, the place or the description, you’re shown the email to check before it goes."
                  >
                    Email confirmed attendees about this change
                  </OptionRow>
                </div>
              )}

              {showApprove && (
                <div className={`${styles.part} ${styles.sendBack}`}>
                  <Field
                    id="rejectNote"
                    label="Send it back with a note"
                    hint="Say what needs changing. The person running the event sees it."
                  >
                    <Input
                      id="rejectNote"
                      placeholder="e.g. Add the room, and say whether there’s food"
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                    />
                  </Field>
                  <Button variant="secondary" onClick={onReject} disabled={busy}>
                    Send back
                  </Button>
                </div>
              )}

              {publishStatus.kind === "error" && (
                <Notice tone="warning" role="alert" title="It wasn’t published.">
                  {publishStatus.message}
                </Notice>
              )}
              {publishStatus.kind === "announced" && <Notice>{publishStatus.message}</Notice>}
              {queuedAnnouncement !== null && (
                // The QUEUED announcement's own state, off the event document rather
                // than out of a publish response: the job finishes minutes after the
                // request that queued it, and an approver who comes back tomorrow
                // still needs to be able to see whether it went.
                <Notice tone="neutral">{queuedAnnouncement}</Notice>
              )}
            </section>

            {error && (
              <Notice tone="warning" role="alert" className={styles.stepMessage}>
                {error}
              </Notice>
            )}

            <div className={styles.stepFoot}>
              {previous && (
                <Button variant="secondary" leading={<BackIcon />} onClick={() => goTo(previous.key)}>
                  Back
                </Button>
              )}
              <div className={styles.stepFootEnd}>
                {editable && (
                  <Button
                    variant={
                      step === "send" && !showSubmit && !showApprove && !showPublish
                        ? "primary"
                        : "secondary"
                    }
                    onClick={onSave}
                    disabled={busy || !dirty || endBeforeStart}
                  >
                    {busy ? "Saving…" : "Save"}
                  </Button>
                )}
                {next && (
                  <Button trailing={<ForwardIcon />} onClick={() => goTo(next.key)}>
                    Next: {next.label}
                  </Button>
                )}
                {step === "send" && showRevert && (
                  <Button variant="ghost" onClick={onRevertToDraft} disabled={busy}>
                    Move back to draft
                  </Button>
                )}
                {step === "send" && showSubmit && (
                  <Button onClick={onSubmitForReview} disabled={busy || endBeforeStart}>
                    Send for approval
                  </Button>
                )}
                {step === "send" && showApprove && (
                  <Button onClick={onApprove} disabled={busy}>
                    Approve
                  </Button>
                )}
                {step === "send" && showPublish && (
                  <Button onClick={onPublish} disabled={publishStatus.kind === "publishing"}>
                    {publishStatus.kind === "publishing" ? "Publishing…" : "Publish"}
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {step === "send" && (showCancel || showArchive || showDelete) && (
            <Card as="section" padding="lg" className={styles.careful}>
              <h2 className={styles.sectionTitle}>Careful</h2>
              <ul className={styles.carefulList}>
                {showCancel && (
                  <li className={styles.carefulRow}>
                    <div className={styles.carefulWords}>
                      <strong>Cancel this event</strong>
                      <span>
                        It stays at its link, marked as cancelled. You choose whether the people
                        coming are emailed.
                      </span>
                    </div>
                    <Button variant="danger" onClick={openCancelModal} disabled={busy}>
                      Cancel event…
                    </Button>
                  </li>
                )}
                {showArchive && (
                  <li className={styles.carefulRow}>
                    <div className={styles.carefulWords}>
                      <strong>
                        {event.archived ? "Bring this event back" : "Archive this event"}
                      </strong>
                      <span>
                        {event.archived
                          ? "It goes back to where it was in Manage events."
                          : "It moves to the Archived tab in Manage events. Nothing is deleted, and you can bring it back."}
                      </span>
                    </div>
                    <Button variant="secondary" onClick={onArchive} disabled={busy}>
                      {event.archived ? "Unarchive" : "Archive"}
                    </Button>
                  </li>
                )}
                {showDelete && (
                  <li className={styles.carefulRow}>
                    <div className={styles.carefulWords}>
                      <strong>Delete this event</strong>
                      <span>
                        The event, every sign-up and its images go for good. This can’t be undone.
                      </span>
                    </div>
                    <Button variant="danger" onClick={onDelete} disabled={busy}>
                      Delete event…
                    </Button>
                  </li>
                )}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {cancelOpen && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-event-title"
        >
          <div className={styles.modal}>
            {cancelState.kind === "done" ? (
              <>
                <h2 id="cancel-event-title" className={styles.modalTitle}>
                  Event cancelled
                </h2>
                <p className={styles.modalHint}>
                  {cancelState.notified
                    ? cancelState.sent > 0
                      ? `Emailed ${cancelState.sent} attendee${
                          cancelState.sent === 1 ? "" : "s"
                        } about the cancellation.`
                      : "Nobody had a confirmed place or was on the waiting list, so nobody was emailed."
                    : "Nobody was emailed."}
                </p>
                <div className={styles.modalActions}>
                  <Button onClick={() => setCancelOpen(false)}>Close</Button>
                </div>
              </>
            ) : (
              <>
                <h2 id="cancel-event-title" className={styles.modalTitle}>
                  Cancel this event?
                </h2>
                <p className={styles.modalHint}>
                  The event is marked as cancelled. It stays at its link, with
                  “Cancelled” on it, and nobody can sign up.
                </p>
                <OptionRow
                  checked={cancelNotify}
                  onChange={(e) => setCancelNotify(e.target.checked)}
                  disabled={cancelState.kind === "cancelling"}
                >
                  Email everyone with a confirmed place or on the waiting list
                </OptionRow>
                <Field
                  id="cancel-note"
                  label="Note to them (optional)"
                  hint={
                    cancelNotify
                      ? "It goes in the cancellation email: why it’s off, or whether it will run another day."
                      : "Only sent if you tick the box above."
                  }
                >
                  <Textarea
                    id="cancel-note"
                    value={cancelNote}
                    onChange={(e) => setCancelNote(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    disabled={cancelState.kind === "cancelling"}
                    placeholder="e.g. The room fell through. We’re sorry, and we’ll try to run it another day."
                  />
                </Field>
                {cancelState.kind === "error" && (
                  <p className={styles.problem} role="alert">
                    {cancelState.message}
                  </p>
                )}
                <div className={styles.modalActions}>
                  <Button
                    variant="danger"
                    onClick={onConfirmCancel}
                    disabled={cancelState.kind === "cancelling"}
                  >
                    {cancelState.kind === "cancelling" ? "Cancelling…" : "Cancel event"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setCancelOpen(false)}
                    disabled={cancelState.kind === "cancelling"}
                  >
                    Keep event
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {brandingModalOpen && posterUrl && (
        <CoverBrandingModal
          posterUrl={posterUrl}
          value={coverBranding}
          logoColor={coverLogoColor}
          stripSize={coverStripSize}
          logoPosition={coverLogoPosition}
          logoScale={coverLogoScale}
          logoX={coverLogoX}
          logoY={coverLogoY}
          logoBackdrop={coverLogoBackdrop}
          logoShadow={coverLogoShadow}
          onSelect={(choice) => {
            setCoverBranding(choice.branding);
            setCoverLogoColor(choice.logoColor);
            setCoverStripSize(choice.stripSize);
            setCoverLogoPosition(choice.logoPosition);
            setCoverLogoScale(choice.logoScale);
            setCoverLogoX(choice.logoX);
            setCoverLogoY(choice.logoY);
            setCoverLogoBackdrop(choice.logoBackdrop);
            setCoverLogoShadow(choice.logoShadow);
            markDirty();
          }}
          onClose={() => setBrandingModalOpen(false)}
        />
      )}
    </div>
  );
}

function TickIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg
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
      <path d="M8 16L17 7M9 7h8v8" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
