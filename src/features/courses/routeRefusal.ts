/**
 * A SAVE A ROUTE REFUSED, IN THE ROUTE'S OWN WORDS.
 *
 * Every course route answers a refusal with `{ error }`, a sentence a person
 * can act on ("Week 1 isn’t open to you yet."). A page that saves through one
 * shows that sentence when the route answered with it, and blames the
 * connection only when no answer came back: a request `fetch` could not make
 * rejects with whatever `fetch` threw, never with one of these.
 *
 * Pure, with no React and no server import, so every page that saves through
 * a route can read it, in the browser and in a test.
 */

/** A refusal a route answered with: its own sentence, and the status it answered. */
export class RouteRefusal extends Error {
  readonly status: number;

  constructor(sentence: string, status: number) {
    super(sentence);
    this.name = "RouteRefusal";
    this.status = status;
  }
}

/**
 * The refusal in a route's answer, or null when the answer carried no
 * sentence: one the site's own routes never give, such as a page some proxy
 * answered with.
 */
export async function routeRefusalOf(res: Response): Promise<RouteRefusal | null> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  const sentence = body && typeof body.error === "string" ? body.error.trim() : "";
  return sentence ? new RouteRefusal(sentence, res.status) : null;
}
