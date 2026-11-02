/**
 * A FAKE CLAUDE for local mode: the harness owns it the way it owns Mailpit.
 *
 * In local mode `scripts/e2e/run.mjs` starts this server on loopback and hands
 * the app's server `ANTHROPIC_BASE_URL` pointing here and `ANTHROPIC_API_KEY`
 * set to `FAKE_CLAUDE_KEY`. The site's one door to Anthropic
 * (`src/lib/ai/claude.ts`) honours that base URL only when it is a loopback
 * address, so this is reachable from a local run and from nowhere else, and a
 * deployed target (dev.naisi.uk) keeps the real model.
 *
 * What it does, and what it refuses:
 *
 *  - It answers the Messages API (`POST /v1/messages`) for the callers in
 *    `CANNED`, each recognised by the JSON schema it asks for (the top-level
 *    `required` keys) and a phrase of its system prompt, with a deterministic
 *    answer in the exact shape that caller's checker keeps. Where a checker
 *    holds the answer to what was sent (the week review's ids, labels and
 *    parts), the answer is built from the request's own message, so it cites
 *    only what was sent.
 *  - A request it does not recognise is answered 400 `invalid_request_error`,
 *    which the door already turns into "Claude couldn't answer just now. Try
 *    again.", and is logged LOUDLY with what to add. A wrong key is answered
 *    401, which the door turns into "Claude refused this site's key", because
 *    a server that sent any other key here is not the harness's server.
 *  - Every request is kept, in order, and `GET /fake/requests` returns them
 *    (`fakeClaudeRequests()` below), so a spec can say which caller was asked
 *    and read every word that would have gone to Anthropic.
 *
 * Nothing here talks to anybody: it is a listener on 127.0.0.1, and no real
 * Claude call can happen in local mode while it is up, since the server's key
 * is not a key.
 *
 * `tests/e2e-fake-claude.test.mjs` runs every canned caller's real ask, through
 * the real door and the real SDK, against this server, and holds that what
 * comes back passes that caller's own checker. A change to a caller's schema,
 * prompt or checker fails `npm test`, never a browser run.
 *
 * ADDING A CALLER: scripts/e2e/README.md, "A fake Claude in local mode".
 */
import { createServer } from "node:http";
import { fetchOrExplain } from "./net.mjs";

/** The key local mode's server holds. Not a key: Anthropic would refuse it, and only this fake accepts it. */
export const FAKE_CLAUDE_KEY = "e2e-fake-claude-key-not-a-real-key";

/** The fake's port on 127.0.0.1, beside the server's 3100 and the persona server's 3101. */
export const FAKE_CLAUDE_PORT = 3102;

/**
 * The words the canned answers say, for a spec to hold a page to. Plain
 * British English, no dashes, and no "Fellow N", "Group N" or "Rater N": a
 * note that names a label it was never sent is refused (`noteLabelSlips`).
 */
export const FAKE_CLAUDE_WORDS = {
  /** A note's draft. "The fellow" is put back as the person's first name in the admin's box. */
  note: "The fellow reads each week closely and ties the material to their own view. Worth asking the fellow about facilitating a group next term.",
  /** Every written answer's draft grade. */
  grade: 7,
  themeTitle: "Moving from the reading to their own view",
  themeDetail: "Several people summarised the reading well but found it hard to say what they think themselves.",
  handWhy: "Their answer stops short of the question this week, so a quiet word may help.",
};

/** Every id in a message that sits at the start of a heading line, in order, once each. */
function idsIn(message, pattern) {
  const out = [];
  for (const match of message.matchAll(pattern)) if (!out.includes(match[1])) out.push(match[1]);
  return out;
}

/**
 * The callers this fake answers. Each: a name for the log, the source file
 * whose ask it stands in for, the schema's top-level `required` keys and a
 * phrase of the system prompt that together recognise it, the routes that
 * reach it, and `answer(message)`, the JSON object Claude would send back.
 */
export const CANNED = [
  {
    caller: "coursework-note-draft",
    source: "src/lib/courses/coursework/claude.ts (askForNoteDraft)",
    required: ["note"],
    system: "keep short notes about the people on its courses",
    routes: [
      "/api/admin/members/[uid]/notes/draft",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/notes/draft",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/weeks/[weekId]/notes/draft",
    ],
    answer: () => ({ note: FAKE_CLAUDE_WORDS.note }),
  },
  {
    caller: "week-review-grades",
    source: "src/lib/courses/weekReview/claude.ts (askForGrades)",
    required: ["grades"],
    system: "choose which written answers on one of its courses to read first",
    routes: ["/api/admissions/forms/[roundId]/programmes/[programmeId]/weeks/[weekId]/review"],
    // Every answer sent ("### A12"), graded once.
    answer: (message) => ({
      grades: idsIn(message, /^### (A\d+)$/gm).map((answer) => ({ answer, grade: FAKE_CLAUDE_WORDS.grade })),
    }),
  },
  {
    caller: "week-review-themes",
    source: "src/lib/courses/weekReview/claude.ts (askForThemes)",
    required: ["themes"],
    system: "see what the people on one of its courses found hard in one week",
    routes: ["/api/admissions/forms/[roundId]/programmes/[programmeId]/weeks/[weekId]/review"],
    // One theme, on the first part, resting on every answer and report sent ("### A12 · Q1 · Group 1",
    // "### R2 · Group 1") and on no check-in. Nothing at all when nothing was sent to rest one on.
    answer: (message) => {
      const answers = idsIn(message, /^### (A\d+) · /gm);
      const reports = idsIn(message, /^### (R\d+) · /gm);
      if (answers.length + reports.length === 0) return { themes: [] };
      const part = idsIn(message, /^(P\d+)\. /gm)[0] ?? "";
      return {
        themes: [
          { title: FAKE_CLAUDE_WORDS.themeTitle, part, answers, checkIns: [], reports, detail: FAKE_CLAUDE_WORDS.themeDetail },
        ],
      };
    },
  },
  {
    caller: "week-review-hands",
    source: "src/lib/courses/weekReview/claude.ts (askForHands)",
    required: ["hands"],
    system: "notice who on one of its courses might need a hand this week",
    routes: ["/api/admissions/forms/[roundId]/programmes/[programmeId]/weeks/[weekId]/review"],
    // The first fellow sent ("### A12 · Fellow 1 · Group 1 · Q1"), resting on their own answers.
    answer: (message) => {
      const rows = [...message.matchAll(/^### (A\d+) · (Fellow \d+) · /gm)];
      if (rows.length === 0) return { hands: [] };
      const fellow = rows[0][2];
      const answers = rows.filter((row) => row[2] === fellow).map((row) => row[1]);
      return { hands: [{ fellow, why: FAKE_CLAUDE_WORDS.handWhy, answers, reports: [] }] };
    },
  },
];

/** The schema's top-level required keys, sorted and joined: how a caller is told apart. */
function requiredOf(body) {
  const required = body?.output_config?.format?.schema?.required;
  return Array.isArray(required) ? [...required].map(String).sort().join(",") : "";
}

/** The system prompt as one string, whether sent as a string or as text blocks. */
function systemOf(body) {
  const system = body?.system;
  if (typeof system === "string") return system;
  if (Array.isArray(system)) return system.map((block) => (typeof block?.text === "string" ? block.text : "")).join("\n");
  return "";
}

/** The one user message's text. */
function messageOf(body) {
  const first = Array.isArray(body?.messages) ? body.messages[0] : null;
  const content = first?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((block) => (typeof block?.text === "string" ? block.text : "")).join("\n");
  return "";
}

/** The canned caller a Messages API body is from, or null. Pure: the unit test calls it. */
export function recogniseRequest(body) {
  const required = requiredOf(body);
  const system = systemOf(body);
  return CANNED.find((entry) => [...entry.required].sort().join(",") === required && system.includes(entry.system)) ?? null;
}

/**
 * A Messages API response carrying `value` as its one text block, as the API
 * answers a structured request. It has no `role` key ("assistant" on the real
 * API): the door never reads it, and tests/e2e-no-privilege-grants.test.mjs
 * reads every role literal in the harness as a site role, rightly.
 */
export function messageResponse(body, value) {
  const text = JSON.stringify(value);
  return {
    id: `msg_fake_${Date.now().toString(36)}`,
    type: "message",
    model: typeof body?.model === "string" ? body.model : "fake-claude",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: Math.ceil(messageOf(body).length / 4), output_tokens: Math.ceil(text.length / 4) },
  };
}

function errorBody(type, message) {
  return { type: "error", error: { type, message } };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 20 * 1024 * 1024) {
        reject(new Error("request body over 20 MB"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

/**
 * Starts the fake on 127.0.0.1. Resolves to `{ url, requests, close }` once it
 * is listening; `port: 0` takes any free port (the unit test does).
 */
export function startFakeClaude({ port = FAKE_CLAUDE_PORT, log = (line) => console.log(line) } = {}) {
  const requests = [];
  const loud = (lines) => console.error(["", "[fake-claude] ================================================================", ...lines.map((line) => `[fake-claude] ${line}`), "[fake-claude] ================================================================", ""].join("\n"));

  const send = (response, status, payload) => {
    const json = JSON.stringify(payload);
    response.writeHead(status, { "content-type": "application/json", "request-id": `req_fake_${requests.length}` });
    response.end(json);
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    try {
      if (request.method === "GET" && url.pathname === "/fake/requests") {
        send(response, 200, requests);
        return;
      }
      if (request.method !== "POST" || url.pathname !== "/v1/messages") {
        loud([`${request.method} ${url.pathname}: not an endpoint this fake answers (only POST /v1/messages).`]);
        send(response, 404, errorBody("not_found_error", `fake Claude: no endpoint ${request.method} ${url.pathname}`));
        return;
      }
      const raw = await readBody(request);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        loud(["POST /v1/messages with a body that is not JSON."]);
        send(response, 400, errorBody("invalid_request_error", "fake Claude: the body is not JSON"));
        return;
      }
      // The SDK sends the key as a bearer token; `x-api-key` is the older header, taken too.
      const bearer = /^Bearer (.+)$/.exec(String(request.headers.authorization ?? ""))?.[1];
      const key = bearer ?? request.headers["x-api-key"];
      const entry = recogniseRequest(body);
      const record = {
        at: new Date().toISOString(),
        caller: entry?.caller ?? null,
        model: typeof body.model === "string" ? body.model : null,
        required: requiredOf(body),
        system: systemOf(body),
        message: messageOf(body),
      };
      requests.push(record);
      if (key !== FAKE_CLAUDE_KEY) {
        loud([
          "A request arrived with a key that is not FAKE_CLAUDE_KEY. Refused 401.",
          "Only scripts/e2e/run.mjs's server should be talking to this fake.",
        ]);
        send(response, 401, errorBody("authentication_error", "fake Claude: not the harness's key"));
        return;
      }
      if (!entry) {
        loud([
          "A REQUEST THIS FAKE HAS NO CANNED ANSWER FOR. Answered 400, which the site says as",
          "\"Claude couldn't answer just now. Try again.\"",
          `  schema required: [${record.required}]`,
          `  system begins:   ${record.system.slice(0, 160).replace(/\s+/g, " ")}`,
          "Add a canned answer to CANNED in scripts/e2e/lib/fakeClaude.mjs and a case to",
          "tests/e2e-fake-claude.test.mjs (scripts/e2e/README.md, \"A fake Claude in local mode\").",
        ]);
        send(response, 400, errorBody("invalid_request_error", "fake Claude: no canned answer for this request"));
        return;
      }
      const value = entry.answer(record.message);
      log(`[fake-claude] answered ${entry.caller}.`);
      send(response, 200, messageResponse(body, value));
    } catch (error) {
      loud([`The fake failed on ${request.method} ${url.pathname}: ${error?.message ?? error}`]);
      if (!response.headersSent) send(response, 500, errorBody("api_error", "fake Claude: the fake failed"));
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        requests,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}

/**
 * For a spec: every request the local server sent to the fake so far, in
 * order, each `{ at, caller, model, required, system, message }` (`caller`
 * null for one it did not recognise). `E2E_FAKE_CLAUDE_URL` is set by run.mjs
 * for the specs it drives; against a deployed target there is no fake and
 * this throws.
 */
export async function fakeClaudeRequests() {
  const base = process.env.E2E_FAKE_CLAUDE_URL;
  if (!base) throw new Error("E2E_FAKE_CLAUDE_URL is not set: the fake Claude runs only in local mode (npm run e2e:browser -- --local).");
  const url = new URL(base);
  if (url.hostname !== "127.0.0.1") throw new Error(`E2E_FAKE_CLAUDE_URL must be loopback, got ${url.hostname}.`);
  const response = await fetchOrExplain(`${url.origin}/fake/requests`);
  if (!response.ok) throw new Error(`the fake Claude's request log answered ${response.status}`);
  return response.json();
}
