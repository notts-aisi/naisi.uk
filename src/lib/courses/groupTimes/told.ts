import "server-only";
import type {
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Query,
  QuerySnapshot,
  Transaction,
} from "firebase-admin/firestore";
import { facilitatingMarkerId } from "@/lib/courses/allocationPublish";
import { normalizeCourseEnrolment, placementIsTold } from "@/lib/firestore/courseEnrolments";

/**
 * WHICH OF A RUN'S GROUPS PUBLISH HAS TOLD SOMEBODY THE TIME OF, the one
 * answer the times picture and the two routes that change a group's time
 * ask.
 *
 * Publish tells two kinds of person when a group meets, and records each:
 *
 *  - SOMEBODY PLACED IN IT, emailed their group, day and time: their seat
 *    is told (`placementIsTold`, the one answer every reader of placements
 *    asks). A seat that has left the run, or is somewhere else now, or a
 *    move that cleared the stamp, tells nothing about this group.
 *  - ITS FACILITATORS, emailed "You’re facilitating": a once-only marker per
 *    facilitator per group in `courseNudges`, at the id Publish's own plan
 *    reads (`facilitatingMarkerId`). Only the group's facilitators NOW are
 *    asked: somebody taken off it is told nothing more about it.
 *
 * A seat on the run that is a facilitator's own row says nothing here: being
 * appointed tells nobody the time, and Publish's email does.
 *
 * Read through `Reads`, so a route asks it inside the transaction that
 * changes the time, and a press of Publish landing between the two makes the
 * transaction read it again.
 */

/** The two kinds of read this needs, from a database handle or inside a transaction. */
export type Reads = {
  query: (query: Query) => Promise<QuerySnapshot>;
  all: (refs: DocumentReference[]) => Promise<DocumentSnapshot[]>;
};

export function readsOf(db: Firestore): Reads {
  return {
    query: (query) => query.get(),
    all: async (refs) => (refs.length ? db.getAll(...refs) : []),
  };
}

export function readsIn(tx: Transaction): Reads {
  return {
    query: (query) => tx.get(query),
    all: async (refs) => (refs.length ? tx.getAll(...refs) : []),
  };
}

/** A group, as much of it as this asks about. */
export type ToldGroup = { id: string; facilitatorUids: readonly string[] };

export async function toldGroupIds(
  db: Firestore,
  reads: Reads,
  runId: string,
  groups: readonly ToldGroup[],
): Promise<Set<string>> {
  const told = new Set<string>();
  if (groups.length === 0) return told;
  const asked = new Set(groups.map((group) => group.id));

  // One equality on one field, so no declared index: every seat on the run.
  const seats = await reads.query(db.collection("courseEnrolments").where("runId", "==", runId));
  for (const doc of seats.docs) {
    const seat = normalizeCourseEnrolment(doc.id, doc.data() ?? {});
    // On the run still: active, or completed once it has ended. Somebody who
    // left, or was taken off, is told nothing more about the group.
    if (seat.runId !== runId || seat.role !== "learner") continue;
    if (seat.status !== "active" && seat.status !== "completed") continue;
    if (!seat.groupId || !asked.has(seat.groupId)) continue;
    if (placementIsTold(seat)) told.add(seat.groupId);
  }

  // Each facilitator's marker by its own address, for the groups not told yet.
  const slots = groups
    .filter((group) => !told.has(group.id))
    .flatMap((group) => group.facilitatorUids.map((uid) => ({ groupId: group.id, uid })));
  const markers = await reads.all(
    slots.map((slot) => db.collection("courseNudges").doc(facilitatingMarkerId(runId, slot.groupId, slot.uid))),
  );
  markers.forEach((marker, at) => {
    if (marker.exists) told.add(slots[at].groupId);
  });
  return told;
}
