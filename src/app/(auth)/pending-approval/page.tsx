"use client";

import Link from "next/link";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { signOut } from "@/auth/signInWithGoogle";
import { useRouter } from "next/navigation";
import styles from "../register/registerSignIn.module.css";

export default function PendingApprovalPage() {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  return (
    <div className={`${styles.frame} ${styles.frameNote}`}>
      <Card padding="lg" className={styles.card} style={{ width: "100%" }}>
        <div className={styles.stack}>
          <div>
            <Badge tone="accent">Join request sent</Badge>
          </div>
          <h1 className={styles.noteTitle}>
            Thanks. The committee will check your join request.
          </h1>
          <p className={styles.para}>We&rsquo;ll email you when it&rsquo;s done.</p>
          {/* Programme applications are deliberately open to `pending` accounts
              (the apply page lives in `(public)` for exactly this reason), so
              waiting on approval shouldn't feel like waiting on everything. */}
          <p className={`${styles.para} ${styles.paraStrong}`}>
            In the meantime you can{" "}
            <Link href="/courses" style={{ color: "var(--color-accent)" }}>
              apply for a course
            </Link>{" "}
            and sign up to events. If you get a place, that approves your account
            too.
          </p>
          {/* An applicant can already hold a course place (open enrolment admits a
              pending account), but the course area itself opens only once the
              committee has approved the account. Say so here, because this is the
              page /learn sends them to, and a place that looks lost is a support
              email. */}
          <p className={`${styles.para} ${styles.paraSmall}`}>
            If you already hold a place on a course, it is kept for you. The course
            area opens as soon as your account is approved, so please hold on while
            we process it.
          </p>
          <div className={styles.noteActions}>
            <Button onClick={() => router.push("/courses")}>See the programmes</Button>
            <Button variant="secondary" onClick={() => router.push("/events")}>
              What&rsquo;s on
            </Button>
          </div>
          <div className={styles.noteLinks}>
            {/* The way to an application from here. A waiting account that signs
                in again from a decision email's button is brought to this page,
                and the list behind this link admits a waiting account. */}
            <Link href="/applications" style={{ color: "var(--color-accent)", fontSize: "var(--text-sm)" }}>
              Your applications
            </Link>
            <Link href="/" style={{ color: "var(--color-accent)", fontSize: "var(--text-sm)" }}>
              ← Back to the homepage
            </Link>
            <button type="button" onClick={handleSignOut} className={styles.textLink}>
              Sign out
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
