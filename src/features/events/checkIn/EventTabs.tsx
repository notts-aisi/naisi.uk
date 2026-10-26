import SectionTabs, { type SectionTab } from "@/components/ui/SectionTabs";

export type EventTabKey = "details" | "signups" | "check-in";

type Props = {
  eventId: string;
  current: EventTabKey;
  /** The Sign-ups tab, for those the attendees page admits. */
  showSignups: boolean;
  /** Confirmed sign-ups, drawn in a pill after "Sign-ups". */
  signups?: number;
  /** The Check-in tab, for an event that has a door: a published one. */
  showCheckIn: boolean;
};

/**
 * An event's own page, in sections (ev-manage): Details (the editor), Sign-ups
 * (the attendees page) and Check-in. Each is its own address, so each keeps
 * its own gate: Sign-ups shows only to those its page admits.
 *
 * The survey after an event will be a fourth section, once event surveys are
 * built; it is left out until then rather than drawn with nothing behind it.
 */
export default function EventTabs({ eventId, current, showSignups, signups, showCheckIn }: Props) {
  const base = `/events/manage/${eventId}`;
  const tabs: SectionTab[] = [{ key: "details", label: "Details", href: base }];
  if (showSignups) {
    tabs.push({ key: "signups", label: "Sign-ups", count: signups, href: `${base}/attendees` });
  }
  if (showCheckIn) tabs.push({ key: "check-in", label: "Check-in", href: `${base}/check-in` });
  return <SectionTabs tabs={tabs} current={current} ariaLabel="Sections" />;
}
