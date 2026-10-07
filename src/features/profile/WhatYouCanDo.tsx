"use client";

import Chip from "@/components/ui/Chip";
import { useAuth } from "@/auth/AuthProvider";
import {
  canApproveCourse,
  canApproveEvent,
  canApproveNewsletter,
  canCirculateWorksheet,
  canDraftCourse,
  canDraftEvent,
  canDraftNewsletter,
  canManageMembership,
} from "@/lib/firestore/users";
import ProfileSection from "./ProfileSection";
import styles from "./WhatYouCanDo.module.css";

/**
 * "What you can do here": the member's own standing on the site, in words.
 *
 * It reads what the signed-in session already holds (the role, whether the
 * Students' Union recognises them, and the grants an admin has given them)
 * and says what each of those lets them do. It asks for nothing new and
 * decides nothing: every sentence names something the site already lets
 * this person do, and each line is tied to the one fact that allows it, so a
 * grant taken away takes its sentence with it.
 *
 * A grant is asked about through the same `can*` helpers the pages and the
 * routes ask, never by reading the map, so this card cannot say yes where
 * they would say no.
 */

const ROLE_WORD = {
  member: "Member",
  committee: "Committee",
  admin: "Admin",
} as const;

export default function WhatYouCanDo() {
  const { role, permissions, suRecognised, admissionsReviewer } = useAuth();
  if (role !== "member" && role !== "committee" && role !== "admin") return null;

  const who = { role, permissions };

  // What is added to a member's own things, each line from the fact beside it.
  const also: string[] = [];
  if (role === "committee") {
    also.push("Open the events area and help with an event you’ve been added to.");
    also.push("Write and fill in worksheets.");
  }
  if (canDraftEvent(who)) {
    also.push(
      canApproveEvent(who) ? "Create events and publish them." : "Create events. An admin publishes them.",
    );
  } else if (canApproveEvent(who)) {
    also.push("Publish events.");
  }
  if (role === "committee" && suRecognised) {
    also.push("See who’s signed up to an event.");
    also.push("See committee tasks.");
  }
  if (canDraftNewsletter(who)) {
    also.push(
      canApproveNewsletter(who)
        ? "Write the newsletter and send it."
        : "Write the newsletter. An admin sends it.",
    );
  } else if (canApproveNewsletter(who)) {
    also.push("Check the newsletter and send it.");
  }
  if (canDraftCourse(who) || canApproveCourse(who)) {
    also.push("Edit the fellowship pages and their weekly material.");
  }
  if (canManageMembership(who)) also.push("Keep the SU membership list.");
  if (canCirculateWorksheet(who)) also.push("Send a worksheet to people.");
  if (admissionsReviewer) also.push("Read applications for the programmes you review.");

  return (
    <ProfileSection
      headingId="profile-can-do"
      title="What you can do here"
      description="This changes if you join the committee or lead a programme."
    >
      <div className={styles.chips}>
        <Chip tone="accent">{ROLE_WORD[role]}</Chip>
        {role === "committee" && suRecognised && <Chip tone="neutral">SU-recognised</Chip>}
      </div>
      {role === "admin" ? (
        <p className={styles.lead}>
          You’re an admin. You can do everything on the site, and you decide what everybody else
          can do.
        </p>
      ) : (
        <>
          <p className={styles.lead}>
            {role === "committee"
              ? "You’re on the committee. Like every member, you can apply for programmes and sign up to events."
              : "You’re a member. You can apply for programmes and sign up to events."}
          </p>
          {also.length > 0 && (
            <>
              <p className={styles.alsoTitle}>
                {role === "committee" ? "On the committee you can also" : "You can also"}
              </p>
              <ul className={styles.also}>
                {also.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}
          {(role === "committee" || also.length > 0) && (
            <p className={styles.missing}>Something missing? Ask an admin.</p>
          )}
        </>
      )}
    </ProfileSection>
  );
}
