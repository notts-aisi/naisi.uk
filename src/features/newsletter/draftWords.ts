import { formatSiteDate } from "@/lib/datetime/siteTime";
import type { DraftStatus, NewsletterDraft } from "@/lib/firestore/newsletterDrafts";

/** The chip tone that goes with each step of the pipeline. A status always comes with its word. */
export function statusTone(
  status: DraftStatus,
): "neutral" | "accent" | "success" | "danger" | "warning" {
  switch (status) {
    case "draft":
      return "neutral";
    case "pending":
      return "warning";
    case "approved":
      return "accent";
    case "sent":
      return "success";
    case "rejected":
      return "danger";
  }
}

/** "Mon 12 Oct", in the site's own time zone. */
export function dayOf(d: Date): string {
  return formatSiteDate(d, { weekday: "short", day: "numeric", month: "short" });
}

/** The same instant in full: the day, the year and the time. */
export function momentOf(d: Date): string {
  return formatSiteDate(d, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * How many people a sent edition reached, or how many emails when only that
 * was kept (editions sent before the count of people was recorded). Null for
 * a draft, and for an edition with neither number.
 */
export function reachOf(d: NewsletterDraft): string | null {
  if (d.status !== "sent" || d.sentCount == null) return null;
  if (d.subscribersReached != null) {
    return `${d.subscribersReached} ${d.subscribersReached === 1 ? "person" : "people"}`;
  }
  return `${d.sentCount} email${d.sentCount === 1 ? "" : "s"}`;
}
