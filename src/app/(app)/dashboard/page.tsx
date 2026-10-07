import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { loadStatusRows } from "@/lib/admissions/statusHubData";
import Badge from "@/components/ui/Badge";
import YourApplications, {
  type YourApplicationRow,
} from "@/features/applications/home/YourApplications";
import MyCoursesSummary from "@/features/courses/MyCoursesSummary";
import MyWorkSummary from "@/features/tasks/components/MyWorkSummary";
import { InstallCard } from "@/features/pwa/InstallCard";

/**
 * What this member has applied to, as the dashboard names it, or null when
 * that could not be read.
 *
 * Read with the loader behind `/applications` itself, by the session's own
 * uid, so the card is shown exactly when that page has something on it: a
 * row the list would drop is not counted here either. Two fields of each row
 * leave, the two the card prints.
 *
 * A failed read is null and never an empty list. Empty means "has not
 * applied", and the card would then hide the way back from somebody who has.
 */
async function applicationsOf(uid: string): Promise<YourApplicationRow[] | null> {
  const db = getAdminDb();
  if (!db) return null;
  try {
    const rows = await loadStatusRows(db, uid, new Date());
    return rows.map((row) => ({ roundId: row.round.id, label: row.round.label }));
  } catch (err) {
    console.warn("[dashboard] could not read this member's applications", err);
    return null;
  }
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const applications = user ? await applicationsOf(user.uid) : [];

  return (
    <div>
      <div style={{ marginBottom: "var(--space-8)" }}>
        <Badge tone="accent">Dashboard</Badge>
        <h1 style={{ marginTop: "var(--space-3)" }}>
          Welcome back{user?.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}.
        </h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-2)" }}>
          Your home base. Open tasks, overdue items, and what&apos;s coming up next.
        </p>
      </div>

      {/* Quiet install invitation: phones only, dismissible once, hidden
          when already installed. See src/features/pwa/InstallCard.tsx. */}
      <InstallCard />

      <MyCoursesSummary />
      {/* The way back to somebody's applications. Nothing is drawn for a
          member who has not applied to anything. */}
      <YourApplications rows={applications} />
      <MyWorkSummary />
    </div>
  );
}
