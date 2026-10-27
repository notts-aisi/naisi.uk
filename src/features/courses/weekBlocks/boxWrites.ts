import type { ExerciseResponseWire } from "@/app/api/courses/runs/[runId]/exercises/[exerciseId]/submit/route";
import { REFLECTION_NOT_SAVED } from "@/lib/courses/memberPageWords";
import { routeRefusalOf } from "../routeRefusal";

/**
 * THE WRITES OF A PERSON'S OWN BOXES ON A WEEK PAGE: a reflection box
 * (`ReflectStop`, `PUT /api/courses/runs/[runId]/reflections/[promptId]`) and
 * a fill-in box (`FillInCard`, `PUT /api/courses/runs/[runId]/fill-in-boxes/
 * [boxId]`). Each sends what the box holds and resolves to the stored row.
 *
 * A write that did not land rejects with the words the box says under itself:
 * the route's own sentence when the route refused it ("Only somebody taking
 * part in this programme can write in its reflection boxes."), and the
 * connection's (`REFLECTION_NOT_SAVED`) only when no answer came back, or
 * one came back with nothing to say. Never the browser's own words for a
 * request it could not make.
 *
 * Pure of React, so the pages and the tests reach the same code.
 */

type BoxWrite = {
  runId: string;
  weekId: string;
  text: string;
  /** True on the leaving and page-hide paths: the request outlives the page. */
  keepalive: boolean;
};

/** The request each box sends: what it holds, on the week it is in. */
function put(args: BoxWrite): RequestInit {
  return {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weekId: args.weekId, text: args.text }),
    // A box holds a few thousand characters at most, far under a keepalive
    // request's budget, so the last change outlives the page.
    keepalive: args.keepalive,
  };
}

/** The stored row a box's write answered with, or the words that say why there is none. */
async function storedRow(send: () => Promise<Response>): Promise<ExerciseResponseWire> {
  let res: Response;
  try {
    res = await send();
  } catch {
    // No answer came back: the connection.
    throw new Error(REFLECTION_NOT_SAVED);
  }
  if (!res.ok) throw (await routeRefusalOf(res)) ?? new Error(REFLECTION_NOT_SAVED);
  const body = (await res.json().catch(() => null)) as { response?: ExerciseResponseWire } | null;
  if (!body?.response) throw new Error(REFLECTION_NOT_SAVED);
  return body.response;
}

/** One reflection box, by its prompt's id. */
export function putReflection(args: BoxWrite & { promptId: string }): Promise<ExerciseResponseWire> {
  return storedRow(() =>
    fetch(`/api/courses/runs/${encodeURIComponent(args.runId)}/reflections/${encodeURIComponent(args.promptId)}`, put(args)),
  );
}

/** One fill-in box, by its id. */
export function putFillIn(args: BoxWrite & { boxId: string }): Promise<ExerciseResponseWire> {
  return storedRow(() =>
    fetch(`/api/courses/runs/${encodeURIComponent(args.runId)}/fill-in-boxes/${encodeURIComponent(args.boxId)}`, put(args)),
  );
}
