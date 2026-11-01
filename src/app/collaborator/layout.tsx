import { redirect } from "next/navigation";
import { getCurrentCollaborator } from "@/lib/firebase/session";
import { needsPolicyAcceptance } from "@/lib/legal/acceptance";
import CollaboratorTopBar from "./CollaboratorTopBar";
import styles from "./collaborator.module.css";

/**
 * Limited authed shell for external collaborators. NOT the member `AppShell`
 * (no sidebar / committee nav) — collaborators only see their own application.
 * Server-gated on `getCurrentCollaborator()`; a non-collaborator (member or no
 * session) is bounced to /login. The proxy already requires a session cookie on
 * `/collaborator/*`; this is the real gate.
 */
export default async function CollaboratorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const collaborator = await getCurrentCollaborator();
  if (!collaborator) redirect("/login");
  // Re-consent gate: collaborators have a single home, so gating here is their
  // natural entry point (the member equivalent lives on the shared authed
  // layout), on the same rule (`needsPolicyAcceptance`: an agreement older
  // than privacy v15 or the current terms). Deployed builds only (skipped
  // under local `npm run dev`), matching the member gate. Verify on dev.naisi.uk.
  if (
    process.env.NODE_ENV === "production" &&
    needsPolicyAcceptance(collaborator.policyVersion)
  ) {
    redirect("/re-consent");
  }

  return (
    <div className={styles.shell}>
      <CollaboratorTopBar name={collaborator.fullName || collaborator.email || ""} />
      <main className={styles.main}>
        <div className={styles.column}>{children}</div>
      </main>
    </div>
  );
}
