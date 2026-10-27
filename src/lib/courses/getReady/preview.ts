/**
 * WHAT PUBLISH'S OWN PAGE IS SENT ABOUT PUBLISH'S TWO EMAILS (board
 * st-publish), by `GET /api/courses/runs/[runId]/allocation/publish/preview`.
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
  facilitators: PreviewKind;
  /** Why an email cannot be written, a sentence each: the plan's own refusals. */
  refusals: string[];
};
