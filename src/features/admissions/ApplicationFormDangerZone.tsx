"use client";

import { useRouter } from "next/navigation";
import DestroyPanel from "@/features/destroy/DestroyPanel";

/**
 * The danger zone for an application form, on the older round page.
 *
 * Destroying is the one thing the older console and an application form
 * share: the same two routes take a form's question sets, its decisions and
 * its applications with it, and write the member records first. So the older
 * round page keeps this panel for a form and nothing else of the older editor.
 *
 * A client component of its own because the panel reports back through a
 * callback, and a server page cannot hand a function to a client component.
 * It is given three strings and nothing of the form itself.
 *
 * Mounted for an admin only, which is a rendering decision: both routes
 * behind the panel refuse anybody else whatever this draws.
 */
export default function ApplicationFormDangerZone({
  roundId,
  label,
  subtitle,
}: {
  roundId: string;
  /** What has to be typed to confirm: the form's name, as stored on the round. */
  label: string;
  subtitle: string;
}) {
  const router = useRouter();
  return (
    <DestroyPanel
      kind="admission-round"
      targetId={roundId}
      label={label}
      nameLabel="round label"
      subtitle={subtitle}
      // Destroying deletes the round document, so there is nothing left here to
      // re-read: back to the list, as the older editor does.
      onDestroyed={() => router.push("/admin/admissions")}
    />
  );
}
