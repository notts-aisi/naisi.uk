import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/firebase/session";
import { canApproveEvent, canDraftEvent } from "@/lib/firestore/users";

export default async function EventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The events area is open to the whole committee, who plan and collaborate
  // here. Creating a new event still needs the draftEvent permission, and the
  // attendee list still needs SU recognition - both gated further in.
  const allowed =
    user.role === "admin" ||
    user.role === "committee" ||
    canDraftEvent(user) ||
    canApproveEvent(user);
  if (!allowed) redirect("/dashboard");

  // No heading here: each page of the area draws its own, so every one of
  // them has a single h1 that names what it is.
  return <>{children}</>;
}
