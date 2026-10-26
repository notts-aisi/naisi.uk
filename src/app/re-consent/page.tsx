import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { bypass } from "@/lib/devBypass";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentCollaborator, getCurrentUser } from "@/lib/firebase/session";
import { CURRENT_POLICY_VERSION, currentPolicy } from "@/lib/legal/policies";
import ReConsentActions from "./ReConsentActions";

export const metadata: Metadata = {
  title: "Review our updated policies",
  robots: { index: false, follow: false },
};

const SUPPORT_EMAIL = "ai-safety@uonsu.com";

/**
 * Does this uid have a `users` doc for the accept action to stamp?
 *
 * `getCurrentUser()` cannot answer it: an account with no doc resolves to a
 * default shape with role "pending", which is indistinguishable from a real
 * applicant awaiting approval. One addressed read, on a page almost nobody
 * loads, is the cheapest honest answer. A missing Admin SDK reads as "no
 * doc", the same conservative default the rest of the page takes.
 */
async function hasMemberDoc(uid: string): Promise<boolean> {
  const db = getAdminDb();
  if (!db) return false;
  try {
    const snap = await db.collection("users").doc(uid).get();
    return snap.exists;
  } catch {
    return false;
  }
}

/**
 * Re-consent gate landing. Reached from the authed layout (members) or the
 * collaborator layout (collaborators) when a user's stored policyVersion is
 * behind CURRENT_POLICY_VERSION. Lives OUTSIDE the (app) / collaborator shells so
 * those gates don't loop, and renders only the gate (no nav chrome to slip past).
 */
export default async function ReConsentPage() {
  // The local dev bypass has no real account to re-consent — never park it here.
  // No-op in deployed builds (committed stub has isActive: false).
  if (bypass.isActive) redirect("/dashboard");

  // Collaborators are detected first (they have no users doc; getCurrentUser
  // would still resolve a default member shape for them).
  const collaborator = await getCurrentCollaborator();
  const user = collaborator ? null : await getCurrentUser();
  if (!collaborator && !user) redirect("/login");

  // Who the gate is FOR. Anyone whose acceptance we can record, which means
  // anyone with a doc to stamp: a member, a collaborator, and now also a
  // role-pending applicant who has finished registering, because an applicant
  // holding a course place reaches authed pages and must be asked like anybody
  // else. What is still turned away is a session with NOTHING to stamp: an
  // unfinished signup that never wrote a users doc, which resolves to a default
  // role of "pending" here and would otherwise sit on a dead-end gate whose
  // accept button has no document to write to. A rejected account is not an
  // audience for anything. Send both where the normal layouts would, so
  // /re-consent is never a trap.
  if (!collaborator && user) {
    if (user.role === "rejected") redirect("/");
    if (user.role === "pending" && !(await hasMemberDoc(user.uid))) {
      redirect("/pending-approval");
    }
  }

  const isMember = !collaborator;
  const policyVersion = collaborator ? collaborator.policyVersion : user!.policyVersion;
  const homeHref = collaborator ? "/collaborator" : "/dashboard";

  // Already current (accepted in another tab, or navigated here directly) — don't
  // trap an up-to-date user on the gate.
  if (policyVersion === CURRENT_POLICY_VERSION) redirect(homeHref);

  const privacy = currentPolicy("privacy");

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-6) var(--space-4)",
      }}
    >
      <Card padding="lg" style={{ width: "100%", maxWidth: "38rem" }}>
        <Badge>Updated</Badge>
        <h1 style={{ fontSize: "var(--text-2xl)", margin: "var(--space-3) 0 var(--space-2)" }}>
          We&apos;ve updated our Privacy Policy
        </h1>
        <p style={{ color: "var(--color-text-muted)", margin: 0, lineHeight: 1.6 }}>
          To keep using your NAISI account, please review and accept our updated
          Privacy Policy (version {privacy.version}, {privacy.lastUpdated}).
        </p>
        <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-4)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--color-text)" }}>What changed:</strong>{" "}
          the section on courses and programmes now covers a programme while
          it runs and when it ends. It says what a programme&apos;s lead sees,
          including every register of its groups and the notes its
          groups&apos; facilitators share; that the people in your group see
          the notes you share with it; that on an incubator your group sees a
          pitch you send, with your name, and how teams are made; what leaving
          a programme does and who reads your reason; that a place somebody
          gives back can be offered to somebody else until the end of the
          first week; how we record who finished; that certificates are sent
          to the people who finished and to facilitators, private until you
          turn the link on; that you can add your sessions to your calendar
          with a private link, which your calendar&apos;s provider fetches
          and you can replace; and that our surveys are confidential: only
          admins see who said what, and your name comes off two years after
          the programme. It also says that facilitators see names only, never
          email addresses, and that downloads of a programme&apos;s
          attendance are recorded. And it says that, unless you say no, we
          share your name and your record on a programme with Kairos, one of
          our funders, including the ratings you were given at its end, which
          nobody is shown about themselves; you can say no at the end of any
          programme survey or on your profile, at any time.
        </p>
        <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-4)", lineHeight: 1.6 }}>
          Read the full{" "}
          <Link href="/privacy" target="_blank" style={{ color: "var(--color-accent-text)" }}>
            Privacy Policy
          </Link>{" "}
          ·{" "}
          <Link href="/privacy/versions" target="_blank" style={{ color: "var(--color-accent-text)" }}>
            version history
          </Link>{" "}
          ·{" "}
          <Link href="/terms" target="_blank" style={{ color: "var(--color-accent-text)" }}>
            Terms of Use
          </Link>
          .
        </p>

        <ReConsentActions
          isMember={isMember}
          homeHref={homeHref}
          supportEmail={SUPPORT_EMAIL}
        />
      </Card>
    </main>
  );
}
