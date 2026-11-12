#!/usr/bin/env node
/**
 * PIN WEEKS THAT MET AND HAVE SINCE BEEN RE-DATED.
 *
 * A week has no stored date: every session is dated from its group's
 * standing slot plus that week's override. A group whose regular day was
 * changed by hand re-dated the weeks that had already met. A register that
 * was taken keeps the start its session had (`sessionAt`). This finds every
 * week whose taken register disagrees with the start the week resolves to
 * today, and gives that week an override with the weekday and the start of
 * `sessionAt`, in London time, keeping whatever else the override carries.
 * The plan is `scripts/lib/pinMetSessions.mjs`, tested by
 * `tests/pin-met-sessions.test.mjs`.
 *
 * SAFE TO RUN TWICE: a pinned week resolves to its register's start, so the
 * second run plans nothing. Each write reads the group and the register again
 * in a transaction and writes only what the plan still asks for. A week whose
 * override already has its own day or start (a one-week change made through
 * the site) is reported and never written.
 *
 * Usage, with application default credentials:
 *
 *   node scripts/pin-met-sessions.mjs --project naisi-uk-dev          # the plan, nothing changed
 *   node scripts/pin-met-sessions.mjs --project naisi-uk-dev --write  # the plan, then written
 *
 * `--project` is required and must be one of the two projects below. Without
 * `--write` nothing is changed. Run it on dev first, then show a dry run
 * against production before anybody writes there.
 */

import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { londonPartsOf, planGroupPins } from "./lib/pinMetSessions.mjs";

/** The only projects this may touch. */
const PROJECTS = new Set(["naisi-uk-dev", "naisi-uk"]);

function parseArgs(argv) {
  let project = null;
  let write = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--project") {
      project = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--write") {
      write = true;
    } else {
      return { error: `Unknown argument ${JSON.stringify(arg)}.` };
    }
  }
  if (!project || !PROJECTS.has(project)) {
    return { error: "Say --project naisi-uk-dev or --project naisi-uk." };
  }
  return { project, write };
}

/** "Mon 2 Nov, 18:00", as London reads an instant, or "no date". */
function when(instant) {
  if (!instant) return "no date";
  const { dateKey, hhmm } = londonPartsOf(instant);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" }).format(
    new Date(`${dateKey}T12:00:00Z`),
  );
  return `${day}, ${hhmm}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    console.error(args.error);
    process.exit(2);
  }
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: args.project });
  const db = getFirestore();

  const [runSnap, groupSnap, registerSnap] = await Promise.all([
    db.collection("courseRuns").get(),
    db.collection("courseGroups").get(),
    db.collection("courseAttendance").get(),
  ]);
  const runs = new Map(runSnap.docs.map((doc) => [doc.id, doc.data() ?? {}]));
  const registersOf = new Map();
  for (const doc of registerSnap.docs) {
    const data = doc.data() ?? {};
    if (typeof data.groupId !== "string") continue;
    registersOf.set(data.groupId, [...(registersOf.get(data.groupId) ?? []), { id: doc.id, data }]);
  }

  const planned = [];
  for (const doc of groupSnap.docs) {
    const group = doc.data() ?? {};
    const run = runs.get(group.runId);
    if (!run || run.destroying === true) continue;
    const { pins, skipped } = planGroupPins({ run, group, registers: registersOf.get(doc.id) ?? [] });
    const name = typeof group.name === "string" && group.name.trim() ? group.name.trim() : doc.id;
    for (const pin of pins) {
      planned.push({ groupId: doc.id, pin });
      console.log(
        `PIN   ${name} (${doc.id}), week ${pin.weekNumber}: met ${when(pin.met)}, resolves to ${when(pin.resolvedAt)}. ` +
          `Override ${pin.weekId}: ${JSON.stringify(pin.override)}`,
      );
    }
    for (const skip of skipped) {
      console.log(
        `LOOK  ${name} (${doc.id}), week ${skip.weekNumber}: met ${when(skip.met)}, resolves to ${when(skip.resolvedAt)}. ` +
          `Not planned: ${skip.why}.`,
      );
    }
  }
  console.log(`${planned.length} week(s) to pin on ${args.project}.`);
  if (!args.write || planned.length === 0) {
    if (!args.write) console.log("Nothing was changed. Add --write to write the plan.");
    return;
  }

  let written = 0;
  for (const { groupId, pin } of planned) {
    const groupRef = db.collection("courseGroups").doc(groupId);
    const did = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(groupRef);
      if (!fresh.exists) return false;
      const group = fresh.data() ?? {};
      const run = runs.get(group.runId);
      if (!run) return false;
      const registerSnaps = await tx.get(db.collection("courseAttendance").where("groupId", "==", groupId));
      const registers = registerSnaps.docs.map((each) => ({ id: each.id, data: each.data() ?? {} }));
      const again = planGroupPins({ run, group, registers }).pins.find((each) => each.weekId === pin.weekId);
      if (!again) return false;
      tx.update(groupRef, {
        [`sessionOverrides.${again.weekId}.weekday`]: again.override.weekday,
        [`sessionOverrides.${again.weekId}.startTimeLocal`]: again.override.startTimeLocal,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (did) written += 1;
    console.log(`${did ? "WROTE" : "SKIP "} ${groupId} ${pin.weekId}`);
  }
  console.log(`${written} week(s) pinned on ${args.project}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
