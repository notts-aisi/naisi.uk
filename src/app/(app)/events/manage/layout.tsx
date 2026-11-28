import { requireEventsPage } from "@/lib/firebase/pageGates";

export default async function EventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The events area is open to the whole committee, who plan and collaborate
  // here. Creating a new event still needs the draftEvent permission, and the
  // attendee list still needs SU recognition - both gated further in.
  await requireEventsPage();

  // No heading here: each page of the area draws its own, so every one of
  // them has a single h1 that names what it is.
  return <>{children}</>;
}
