/**
 * A running course run in its fourth week, for the suites about changing a
 * session (Q25, wk-session, wk-changes).
 *
 * Built on `tests/lib/updatesWorld.mjs` (the AGI run's people in groups, its
 * cohort list, facilitators and the updates route), which is built on the
 * lead's world and the hand-over world's real handlers and recording mail
 * door. On top of that, the change route and the way the dialog presses it.
 *
 * THE CLOCK. The run's six taught weeks start on Thu 29 Oct 2026, so week 4
 * runs Thu 19 to Wed 25 Nov, as the board's Sessions view draws it. A suite
 * starts at `NOW`, the Thursday morning of week 4, and moves the clock with
 * `at(...)`: the route's own `new Date()` and the database's
 * `serverTimestamp()` both read it.
 *
 * Group B meets on Tuesdays at 6pm for two hours in Hallward B12 (Rahul and
 * Sofia), so its week 4 session is Tue 24 Nov and its last Tue 8 Dec. Group A
 * meets on Thursdays (Sofia), Group C on Wednesdays at 1pm (Tom).
 */
import { mock } from "node:test";
import { A, AGI, B, C, CAST, ROUND, RUN, makeUpdatesWorld, updatesSeed } from "./updatesWorld.mjs";

export { A, AGI, B, C, CAST, ROUND, RUN, updatesSeed };

/** Thu 19 Nov 2026, 10am in London: the first day of week 4. */
export const NOW = new Date("2026-11-19T10:00:00Z");

/** Group B's week 4 session, the board's. */
export const TUE_24 = "2026-11-24";

/** Group B's join link, put on it by the suites that hold a week online. */
export const LINK = "https://meet.example/group-b-standing-link";

/** A reason the group sees, the board's. */
export const AWAY = "Rahul and Sofia are both away.";

mock.timers.enable({ apis: ["Date"], now: NOW });

/**
 * The world, the change route and short ways to press it. `key` names the
 * handle on `globalThis`; `extraStubs` as for `makeWorld`.
 */
export async function makeSessionsWorld(key, extraStubs = []) {
  const made = await makeUpdatesWorld(key, extraStubs);
  const { world, call, courseRoute, loadTs } = made;
  const change = await courseRoute("groups", "[groupId]", "session", "change");
  const sessions = await loadTs("lib/courses/sessions.ts");
  const groups = await loadTs("lib/firestore/courseGroups.ts");

  /** Start again from a seed, at `NOW`. */
  const reset = (seed = updatesSeed()) => {
    const db = made.reset(seed);
    at(NOW);
    return db;
  };

  /** Move every clock the route and the store read. */
  function at(when) {
    const instant = new Date(when);
    mock.timers.setTime(instant.getTime());
    made.setClock(instant);
  }

  /** One request to the change route as `who`. */
  const ask = (who, groupId, body, options = {}) =>
    call(who, change.POST, { groupId }, { body, course: true, ...options });

  /** The group as the routes read it. */
  const group = (groupId = B) => groups.normalizeCourseGroup(groupId, world.db.read(`courseGroups/${groupId}`));

  /** The group's sessions as every schedule surface resolves them. */
  const sessionsOf = (groupId = B) => sessions.resolveSessions(made.run(), group(groupId));

  /**
   * A press made the way the dialog makes one: the count on its button read
   * first, the change, and then, with "Tell the group" on, the update posted
   * to the group through the updates route with the words the change
   * answered.
   */
  async function press(who, groupId, body, { tell = true } = {}) {
    const emailCount = tell ? await made.emailsFor("group", groupId) : 0;
    const changed = await ask(who, groupId, { reason: AWAY, ...body, tell, ...(tell ? { emailCount } : {}) });
    let told = null;
    if (changed.status === 200 && changed.body.update) {
      const update = changed.body.update;
      told = await made.ask.post(who, {
        to: "group",
        groupId: update.groupId,
        title: update.title,
        message: update.message,
        email: update.emailCount > 0,
        ...(update.emailCount > 0 ? { emailCount: update.emailCount } : {}),
      });
    }
    return { changed, told };
  }

  return { ...made, reset, at, change, ask: { ...made.ask, change: ask }, group, sessionsOf, press, sessionsLib: sessions };
}
