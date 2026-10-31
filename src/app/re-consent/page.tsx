import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { bypass } from "@/lib/devBypass";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentCollaborator, getCurrentUser } from "@/lib/firebase/session";
import { needsPolicyAcceptance } from "@/lib/legal/acceptance";
import { currentPolicy } from "@/lib/legal/policies";
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
 * collaborator layout (collaborators) when a user's stored agreement needs the
 * accept page (`needsPolicyAcceptance`: older than privacy v15, the last
 * version anybody is asked to accept, or than the current terms). Lives
 * OUTSIDE the (app) / collaborator shells so those gates don't loop, and
 * renders only the gate (no nav chrome to slip past).
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

  // Nothing to accept (accepted in another tab, or navigated here directly):
  // don't trap somebody the gates would not send here. The same rule as both
  // layouts, so the page and the gates never disagree about who is asked.
  if (!needsPolicyAcceptance(policyVersion)) redirect(homeHref);

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
        {/* What changed in version 15, said before Accept: the last version
            anybody is asked to accept (`needsPolicyAcceptance`), so these four
            paragraphs replace what every earlier version said here. Each
            clause is held to version 15's own sentence by
            tests/privacy-policy.test.mjs. */}
        <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-4)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--color-text)" }}>What changed in version 15.</strong>{" "}
          This policy is now arranged by what we use your information for, and
          it is the last version you&apos;ll be asked to accept: from now on,
          if a change affects how we use your information, we&apos;ll tell you
          on the site and by email before it takes effect.
        </p>
        <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-4)", lineHeight: 1.6 }}>
          What&apos;s new: the people running a programme may rate your written
          work for each other, and you never see those ratings; before a
          session we may remind you of what&apos;s left of that week&apos;s
          work; the people leading your programme may keep notes about you, as
          admins already do; facilitators may see their own group&apos;s
          check-in totals, never who said what; and if your week locks before
          you send your work, the people running your group may read what you
          wrote.
        </p>
        <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-4)", lineHeight: 1.6 }}>
          Claude may help admins review coursework, survey answers and session
          reports, and draft a short weekly note on how each person is doing
          from the work they submitted and the team&apos;s feedback. It never
          receives your name, and only admins see what comes back.
        </p>
        <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-4)", lineHeight: 1.6 }}>
          Admins can see which events you signed up for and whether you came,
          and missing two in a row may be taken into account when places are
          decided. When you ask for a place at an event, its organisers may see
          whether you&apos;re on a programme, whether you facilitate, and
          whether you hold SU membership.
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
