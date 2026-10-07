"use client";

import Link from "next/link";
import { DRAFT_STATUS_LABEL, type NewsletterDraft } from "@/lib/firestore/newsletterDrafts";
import DraftRail, { type RailRow } from "./DraftRail";
import { dayOf, reachOf, statusTone } from "./draftWords";
import { ChevronRightIcon } from "./icons";
import { useDrafts } from "./useDrafts";

/** How many sent editions the rail shows before it points at the full list. */
const SENT_SHOWN = 4;

function rowOf(d: NewsletterDraft): RailRow {
  const sent = d.status === "sent";
  const when = sent ? d.sentAt ?? d.updatedAt : d.updatedAt;
  const reach = reachOf(d);
  return {
    id: d.id,
    href: `/newsletter/${d.id}`,
    title: d.subject || "(no subject)",
    chip:
      d.status === "draft" || sent
        ? undefined
        : { tone: statusTone(d.status), label: DRAFT_STATUS_LABEL[d.status] },
    line: sent ? (
      <>
        {when && <span className="meta">{dayOf(when)}</span>}
        {reach && <span>{reach}</span>}
      </>
    ) : (
      <>
        <span>{d.authorDisplayName ?? "Someone"}</span>
        {when && <span>· edited {dayOf(when)}</span>}
      </>
    ),
  };
}

/**
 * The drafts and the latest sent editions, beside the editor, so moving from
 * one draft to the next does not mean going back to the list first.
 *
 * It reads the same list the list page reads and names each draft's author.
 * Whose a draft is, and who may delete what, stay with the list page and the
 * editor: nothing here depends on who is looking.
 */
export default function EditorRail({ currentId }: { currentId: string }) {
  const { drafts, loading } = useDrafts();
  if (loading) return null;

  const open = drafts.filter((d) => d.status !== "sent");
  const sent = drafts.filter((d) => d.status === "sent");

  return (
    <DraftRail
      ariaLabel="Newsletters"
      currentId={currentId}
      groups={[
        { key: "drafts", label: "Drafts", count: open.length, rows: open.map(rowOf), empty: "No drafts." },
        { key: "sent", label: "Sent", rows: sent.slice(0, SENT_SHOWN).map(rowOf) },
      ]}
      footer={
        <Link href="/newsletter">
          All newsletters
          <ChevronRightIcon size={16} />
        </Link>
      }
    />
  );
}
