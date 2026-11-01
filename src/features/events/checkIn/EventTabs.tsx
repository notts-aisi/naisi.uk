import SectionTabs, { type SectionTab } from "@/components/ui/SectionTabs";

export type EventTabKey = "details" | "signups" | "check-in" | "survey";

type Props = {
  eventId: string;
  current: EventTabKey;
  /** The Sign-ups tab, for those the Sign-ups page admits. */
  showSignups: boolean;
  /** Confirmed sign-ups, drawn in a pill after "Sign-ups". */
  signups?: number;
  /** Requests waiting for a decision, said after that ("4 waiting") when there are any. */
  waiting?: number;
  /** The Check-in tab, for an event that has a door: a published one. */
  showCheckIn: boolean;
};

/**
 * An event's own page, in sections (ev-manage): Details (the editor), Sign-ups
 * (the requests, and for some people everybody who signed up), Check-in and
 * Survey after. Each is its own address, so each keeps its own gate: Sign-ups
 * shows only to those its page admits (`signupAccessFor`), with how many have
 * a place and how many requests are waiting for them. Survey after sits beside Check-in, for an
 * event people can come to: it says to everybody that the survey went and
 * when, and to admins its results.
 */
export default function EventTabs({ eventId, current, showSignups, signups, waiting, showCheckIn }: Props) {
  const base = `/events/manage/${eventId}`;
  const tabs: SectionTab[] = [{ key: "details", label: "Details", href: base }];
  if (showSignups) {
    tabs.push({
      key: "signups",
      label: "Sign-ups",
      count: signups,
      note: waiting !== undefined && waiting > 0 ? `${waiting} waiting` : undefined,
      href: `${base}/attendees`,
    });
  }
  if (showCheckIn) {
    tabs.push({ key: "check-in", label: "Check-in", href: `${base}/check-in` });
    tabs.push({ key: "survey", label: "Survey after", href: `${base}/survey` });
  }
  return <SectionTabs tabs={tabs} current={current} ariaLabel="Sections" />;
}
