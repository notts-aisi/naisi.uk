/**
 * THE UNI-EMAIL SEND GATE: the highest-value assertion in this suite.
 *
 * The magic link proving University of Nottingham affiliation may only ever be
 * sent TO a Nottingham address. The server-side gate is the
 * `validateUniversityEmail()` call in src/app/api/verify-email/send/route.ts,
 * and this file holds it.
 *
 * ORDERING TRAP this test is written around: the route checks
 * `getCurrentUser()` (401) BEFORE it validates the address (400). An
 * unauthenticated probe therefore gets 401 — green for the wrong reason,
 * proving nothing about the gate. So case 1 pins the 401 explicitly and every
 * later case runs with a real session and asserts 400, which is only
 * reachable past the auth check.
 *
 * NO EMAIL IS SENT by any case here: every address is rejected before the
 * route reaches its send block. There is deliberately no positive control
 * with a real @nottingham.ac.uk address, because that would dispatch real
 * mail.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadEnv, runId } from "../lib/env.mjs";
import { anonFetch, authedFetch, withHarnessSession } from "../lib/session.mjs";

const SEND = "/api/verify-email/send";

describe("uni-email gate", () => {
  let session;

  before(async () => {
    loadEnv();
    session = await withHarnessSession(runId());
  });

  after(async () => {
    if (session) await session.dispose();
  });

  it("rejects an unauthenticated caller with 401 (the ordering trap)", async () => {
    const res = await anonFetch(SEND, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "someone@gmail.com" }),
    });
    assert.equal(
      res.status,
      401,
      "Expected 401 for an unauthenticated caller. If this ever returns 400, the " +
        "auth check has moved behind the email check and the rest of this file " +
        "would start passing without a session — i.e. testing nothing.",
    );
  });

  it("rejects a non-Nottingham address with 400", async () => {
    const res = await authedFetch(session.cookie, SEND, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "someone@gmail.com" }),
    });
    const body = await res.json().catch(() => null);
    assert.equal(
      res.status,
      400,
      `Expected 400 for @gmail.com with a valid session, got ${res.status}. ` +
        "A 2xx here means the uni-email magic link can be sent to an address " +
        "outside Nottingham, and it may only ever be sent to a Nottingham " +
        "address.",
    );
    assert.match(
      body?.error ?? "",
      /Nottingham email/i,
      "Expected the Nottingham-address rejection, not some other 400.",
    );
  });

  for (const [label, email] of [
    ["a lookalike suffix domain", "someone@nottingham.ac.uk.attacker.example"],
    ["a hyphen-prefixed domain", "someone@evil-nottingham.ac.uk"],
    ["a substring-only domain", "someone@notnottingham.ac.uk.co"],
    ["an empty address", ""],
  ]) {
    it(`rejects ${label} with 400`, async () => {
      const res = await authedFetch(session.cookie, SEND, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      assert.equal(
        res.status,
        400,
        `Expected 400 for ${JSON.stringify(email)}, got ${res.status}. ` +
          "UNI_EMAIL_PATTERN anchors on the full host, so a lookalike domain " +
          "must never count as proof of UoN affiliation.",
      );
    });
  }
});
