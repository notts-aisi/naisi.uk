"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Button from "@/components/ui/Button";
import PageHead from "@/components/ui/PageHead";
import { PlusIcon } from "./icons";

type Props = {
  /** May start and edit drafts. */
  canDraft: boolean;
  /** May approve and send. */
  canApprove: boolean;
  /** Admins also get the way through to the mailing list. */
  isAdmin: boolean;
};

/**
 * The head of every newsletter page: the name, one line saying what this
 * person can do here, and "New draft" on the right.
 *
 * The three answers come from the layout, which has already read them from
 * the session to decide whether to render at all. They only choose words and
 * whether a link shows: the pages and routes behind the links decide for
 * themselves who may use them.
 */
export default function NewsletterHead({ canDraft, canApprove, isAdmin }: Props) {
  const pathname = usePathname();
  // On the new-draft form the button would lead to the page it is on.
  const showNewDraft = canDraft && pathname !== "/newsletter/new";

  return (
    <PageHead
      title="Newsletter"
      description={
        canApprove
          ? "You can draft, review, and send newsletters."
          : canDraft
            ? "You can draft newsletters and submit them for admin review."
            : "Read-only view."
      }
      meta={isAdmin ? <Link href="/admin/subscriptions">Mailing list</Link> : undefined}
      actions={
        showNewDraft ? (
          <Link href="/newsletter/new">
            <Button variant="secondary" leading={<PlusIcon />}>
              New draft
            </Button>
          </Link>
        ) : undefined
      }
    />
  );
}
