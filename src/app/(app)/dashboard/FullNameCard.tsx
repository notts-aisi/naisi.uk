"use client";

import { useState, type FormEvent } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { useHydrated } from "@/hooks/useHydrated";
import { getClientDb } from "@/lib/firebase/client";
import { FIELD_LIMITS } from "@/lib/firestore/users";
import homeStyles from "./home.module.css";
import styles from "./FullNameCard.module.css";

/**
 * "WHAT'S YOUR FULL NAME?", asked once on Home of an account made before
 * joining asked for one (`fullNameQuestion` in ./homeData.ts decides who).
 *
 * The box starts with the name on the account where there is one, which for
 * an account made with Google is Google's name: offered, never saved for
 * them. Save writes what is in the box; Skip writes only that the question
 * was put. Either way the card does not come back, and Profile always has the
 * field.
 *
 * The person's own document, written from the browser, as Profile writes it.
 * The users rule holds the name to text of at most 120 characters. The page
 * does not draw this card in a view-as session, where the write would be
 * recorded as the member's.
 *
 * The box is uncontrolled and the buttons wait for the page to come alive,
 * so typing before the JavaScript lands is kept and a press before it is not
 * a page reload.
 */
export default function FullNameCard({ uid, suggestion }: { uid: string; suggestion: string | null }) {
  const hydrated = useHydrated();
  const [state, setState] = useState<"asking" | "saving" | "saved" | "skipped">("asking");
  const [problem, setProblem] = useState<string | null>(null);

  if (state === "skipped") return null;

  async function write(patch: Record<string, unknown>, after: "saved" | "skipped") {
    setState("saving");
    setProblem(null);
    try {
      await updateDoc(doc(getClientDb(), "users", uid), {
        ...patch,
        "profile.fullNameAskedAt": serverTimestamp(),
      });
      setState(after);
    } catch (err) {
      console.error(err);
      setState("asking");
      setProblem("That didn’t save. Try again.");
    }
  }

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = new FormData(event.currentTarget).get("fullName");
    const fullName = typeof typed === "string" ? typed.trim().replace(/\s+/g, " ") : "";
    if (!fullName) {
      setProblem("Write your full name, or press Skip.");
      return;
    }
    void write({ "profile.fullName": fullName }, "saved");
  }

  return (
    <section className={homeStyles.card} aria-labelledby="home-full-name">
      <div className={homeStyles.cardHead}>
        <h2 id="home-full-name" className={homeStyles.cardTitle}>
          What’s your full name?
        </h2>
      </div>
      <p className={homeStyles.small}>So the committee can tell people apart. Only the committee sees it.</p>
      {state === "saved" ? (
        <p className={styles.saved} role="status">
          Saved. You can change it on your profile.
        </p>
      ) : (
        <form className={styles.form} onSubmit={onSave} noValidate>
          <Field
            id="home-full-name-box"
            label="Full name"
            hint={suggestion ? "From your Google account. Change it if it’s not right." : undefined}
          >
            <Input
              id="home-full-name-box"
              name="fullName"
              defaultValue={suggestion ?? ""}
              maxLength={FIELD_LIMITS.fullName}
              autoComplete="name"
              disabled={state === "saving"}
            />
          </Field>
          {problem && (
            <p className={styles.problem} role="alert">
              {problem}
            </p>
          )}
          <div className={styles.actions}>
            <Button type="submit" disabled={!hydrated || state === "saving"}>
              {state === "saving" ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={!hydrated || state === "saving"}
              onClick={() => void write({}, "skipped")}
            >
              Skip
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
