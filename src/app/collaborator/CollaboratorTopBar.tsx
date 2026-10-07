"use client";

import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import Button from "@/components/ui/Button";
import { signOut } from "@/auth/signInWithGoogle";
import { hardNavigate } from "@/lib/navigation/hardNavigate";
import styles from "./collaborator.module.css";

/** Minimal top bar for the collaborator area: brand link home + sign out. */
export default function CollaboratorTopBar({ name }: { name: string }) {
  async function handleSignOut() {
    await signOut();
    // Hard nav: the session cookie is cleared, so the authed /collaborator
    // payloads this document cached must not stay reachable.
    hardNavigate("/");
  }

  return (
    <header className={styles.bar}>
      <Link href="/" aria-label="NAISI home" className={styles.brand}>
        <BrandMark size={32} />
      </Link>
      <div className={styles.account}>
        {name && <span className={styles.name}>{name}</span>}
        <Button onClick={handleSignOut} variant="ghost">
          Sign out
        </Button>
      </div>
    </header>
  );
}
