/**
 * WHAT PUBLISH'S OWN PAGE IS SENT ABOUT PUBLISH'S TWO EMAILS,
 * by `GET /api/courses/runs/[runId]/allocation/publish/preview`.
 *
 * Type-only, so the page's client part and the route share one shape. No
 * address is in it: names, ids, the subject and the email's own body.
 */

/** One email as the page shows it: who it is to, the envelope, and its body. */
export type PreviewEmail = {
  /** The name it is to. */
  to: string;
  subject: string;
  /** Who it is from: the mail door's sender name. */
  from: string;
  /** Where replies go: the mail door's own setting, or null with none. */
  replyTo: string | null;
  /** The email itself, drawn by the template the mail door draws it with. */
  html: string;
};

export type PreviewKind = {
  /** Emails a press sends of this kind now. */
  emails: number;
  /** Who they go to, each once, in the order a press sends them. */
  names: { uid: string; name: string }[];
  /** The first of them, drawn, or null when nobody is owed one or none can be written. */
  email: PreviewEmail | null;
};

export type PublishPreview = {
  /** The run is an incubator's: its people are sent the weekly session, not a group. */
  incubator: boolean;
  people: PreviewKind;
  /** "You’ve moved", to each person moved since they were told their group. */
  moved: PreviewKind;
  /** Those people, each with the group they are in now and the one they were told about ("Will: moved to Group H, was Group D"). */
  moves: { uid: string; name: string; to: string; from: string | null }[];
  facilitators: PreviewKind;
  /** "Ana has joined Group B", to each facilitator already told about their group. */
  joined: PreviewKind;
  /** "Ana is no longer in Group D", to each facilitator told about a group somebody moved out of. */
  left: PreviewKind;
  /** Of the people a press emails, whose email carries a note of our own, by name. */
  noted: { uid: string; name: string }[];
  /** The first of those, drawn, when the first person's email (`people.email`) carries none. */
  notedEmail: PreviewEmail | null;
  /**
   * The phone notification that mirrors "Your group": whether this copy of the
   * site sends any, and which of the people a press emails have the courses
   * row of their notifications switched on for it.
   */
  push: { configured: boolean; names: string[] };
  /** Who a press waits for a note, or "Send without a note", for. */
  notesNeeded: string[];
  /** Why an email cannot be written, a sentence each: the plan's own refusals. */
  refusals: string[];
};
