/**
 * "Can't make it" AS AN OLD PAGE PRESSED IT, before requests to be excused.
 *
 * The instant route now records somebody as excused on the spot only for a
 * facilitator, on their own place in a group they facilitate; anybody else
 * taking part asks to be excused and an admin decides. But the lines a fellow
 * said in advance before that change are still on registers, and everything
 * that reads one (the register, the corrections, the take-back, the time
 * card, a session that did not happen) still has to be tested against them.
 *
 * So a test that needs such a line presses the real route, through its real
 * write, with the caller standing as one of the group's facilitators for that
 * one press, and then puts the group's facilitators back exactly as they
 * were. The line written is the one an old page wrote: the route writes it
 * the same way for both.
 *
 * `db` is a test world's store (`read` and `poke`), `groupId` the group's id,
 * `uid` the person pressing and `press` the call itself.
 */
export async function pressedBefore(db, groupId, uid, press) {
  const path = `courseGroups/${groupId}`;
  const was = db.read(path)?.facilitatorUids ?? [];
  db.poke(path, { facilitatorUids: [...was, uid] });
  try {
    return await press();
  } finally {
    db.poke(path, { facilitatorUids: was });
  }
}
