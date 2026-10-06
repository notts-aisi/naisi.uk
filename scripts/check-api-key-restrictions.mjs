#!/usr/bin/env node
/**
 * API key restriction guard (needs Application Default Credentials, talks to
 * apikeys.googleapis.com, so it runs from `.github/workflows/e2e.yml` and NOT
 * from `npm test`, which is offline by contract).
 *
 * WHY THIS EXISTS. `NEXT_PUBLIC_FIREBASE_API_KEY` is inlined into the client
 * bundle by Next, so it ships to every browser that opens the site and is
 * public by construction. What bounds a public key is its API allowlist, and
 * that is a setting in the cloud project, not a file in this repository.
 * `npm test` guards Firestore rules and indexes; it has no view of cloud-side
 * configuration. So the expectation is written down HERE, and a project's keys
 * are compared with it.
 *
 * WHAT IT ASSERTS, in three parts.
 *
 *  1. Every key the project holds is named in KNOWN_KEYS, and every KNOWN_KEYS
 *     entry for that project exists on it. Both directions, so a key somebody
 *     adds by hand fails here rather than going unnoticed, and a key deleted
 *     out from under the registry does too.
 *  2. Each key's apiTargets match ALLOWED_APIS exactly, again both directions.
 *     A missing entry blocks a service the client calls; an extra entry
 *     widens the key past what the client actually calls.
 *  3. No key carries application restrictions (HTTP referrer, IP, app).
 *     Referrer restrictions on a Firebase browser key break sign-in: the auth
 *     handler iframe does not reliably send a Referer header. The API
 *     allowlist is the restriction this guard holds. If a future change makes
 *     an application restriction worth having, that is a deliberate decision
 *     that should edit this file and say why.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not read key material.
 * `keys.list` does not return `keyString` (only `getKeyString` does, and this
 * never calls it), so a compromised run of this guard leaks nothing that is
 * not already in the public client bundle.
 *
 * It also does not compare one project against another live. Every project is
 * asserted against the same checked-in expectation, so the comparison happens
 * in the registry rather than across a credential boundary. Each run reads
 * one project, with the Application Default Credentials of whoever runs it.
 *
 * USAGE
 *   node scripts/check-api-key-restrictions.mjs                    # the default project
 *   node scripts/check-api-key-restrictions.mjs --project <PROJECT_ID>
 */

import { GoogleAuth } from "google-auth-library";

/**
 * The APIs the browser key is allowed to reach, one entry per service with the
 * client code that calls it. Anything not on this list is a widening: the key
 * is public, so its allowlist is what bounds which of the project's enabled
 * APIs it can reach.
 */
const ALLOWED_APIS = {
  "identitytoolkit.googleapis.com":
    "Firebase Auth. `getClientAuth()` in src/lib/firebase/client.ts, and the " +
    "e2e harness's password sign-in in scripts/e2e/lib/session.mjs. Removing " +
    "this breaks every sign-in.",
  "securetoken.googleapis.com":
    "ID token refresh. Same SDK, separate service: without it a session dies " +
    "an hour after sign-in rather than failing visibly at sign-in.",
  "firestore.googleapis.com":
    "`getClientDb()`. Every authed page reads client-direct over onSnapshot.",
  "storage-api.googleapis.com":
    "`getClientStorage()`. Task attachments, event posters, worksheet " +
    "image-upload answers. This is the entry Firebase's own auto-created key " +
    "template uses, which is the evidence it is the right " +
    "service name.",
  "firebaseinstallations.googleapis.com":
    "Installation ids. Initialised by firebase/app itself rather than by any " +
    "call of ours, which is why it is easy to leave off and then see " +
    "intermittent SDK failures.",
};

/**
 * Every API key expected to exist, keyed by uid because uid survives a rename
 * and displayName does not.
 *
 * Note there is no FCM entry anywhere below. Web push here uses the `web-push`
 * package over raw VAPID straight to the browser vendor's push service
 * (src/lib/push/send.ts), not the Firebase Messaging SDK, so no FCM API is
 * reachable with this key and none needs to be.
 */
const KNOWN_KEYS = {
  "9ec6bab3-b9f3-4c91-bccb-d3ad22409221": {
    project: "naisi-uk-dev",
    purpose:
      "The dev project's Firebase web key, inlined into the client bundle as " +
      "NEXT_PUBLIC_FIREBASE_API_KEY and served from dev.naisi.uk.",
  },
  "ea591e1a-5447-469e-946a-038ddca9264a": {
    project: "naisi-uk",
    purpose:
      "The production Firebase web key, same role, served from naisi.uk.",
  },
  "b7f75922-4988-492d-a4f2-e67db5bc56d5": {
    project: "naisi-website",
    purpose:
      "The Firebase web key of the previous production project, which serves " +
      "nothing now. Listed so that the project is held to the same allowlist " +
      "as every other project for as long as it exists.",
  },
};

const PROJECTS = ["naisi-uk-dev", "naisi-uk", "naisi-website"];

function parseArgs(argv) {
  let project = "naisi-uk-dev";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--project") {
      project = argv[i + 1];
      i += 1;
    }
  }
  if (!PROJECTS.includes(project)) {
    throw new Error(
      `Unknown project "${project}". Expected one of: ${PROJECTS.join(", ")}.`,
    );
  }
  return { project };
}

async function listKeys(project) {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const url = `https://apikeys.googleapis.com/v2/projects/${project}/locations/global/keys`;
  const res = await client.request({ url });
  return res.data.keys ?? [];
}

function diff(actual, expected) {
  const missing = expected.filter((x) => !actual.includes(x));
  const unexpected = actual.filter((x) => !expected.includes(x));
  return { missing, unexpected };
}

function fixCommand(project, key, expected) {
  const targets = expected
    .map((s) => `  --api-target=service=${s}`)
    .join(" \\\n");
  return [
    `gcloud services api-keys update ${key.name} \\`,
    `  --project=${project} \\`,
    targets.replace(/^ {2}/, "  "),
  ].join("\n");
}

async function main() {
  const { project } = parseArgs(process.argv.slice(2));
  const expected = Object.keys(ALLOWED_APIS);
  const failures = [];

  let keys;
  try {
    keys = await listKeys(project);
  } catch (err) {
    // Loud, never a silent skip. A guard that quietly passes when it could not
    // look is worse than no guard: it reports the all-clear it did not earn.
    const hint =
      err?.response?.status === 403
        ? "\n  The caller needs roles/serviceusage.apiKeysViewer on the project.\n" +
          "  In CI that is the identity the workflow signs in as; locally it is you."
        : "\n  Run `gcloud auth application-default login` if this is a laptop.";
    console.error(
      `FAIL  could not read API keys for ${project}: ${err.message}${hint}`,
    );
    process.exit(2);
  }

  // 1. The key set itself, both directions.
  const seen = keys.map((k) => k.uid);
  const registered = Object.entries(KNOWN_KEYS)
    .filter(([, v]) => v.project === project)
    .map(([uid]) => uid);

  for (const uid of seen) {
    if (!registered.includes(uid)) {
      const k = keys.find((x) => x.uid === uid);
      failures.push(
        `Unregistered API key on ${project}: "${k.displayName}" (${uid}).\n` +
          `  Every key on this project must be listed in KNOWN_KEYS in this file,\n` +
          `  with what it is for. If this key is legitimate, add it and say why.\n` +
          `  If it is not, it should not exist: delete it.`,
      );
    }
  }
  for (const uid of registered) {
    if (!seen.includes(uid)) {
      failures.push(
        `Registered API key missing from ${project}: ${uid}\n` +
          `  KNOWN_KEYS expects it (${KNOWN_KEYS[uid].purpose})\n` +
          `  but the project does not have it. Either it was deleted (in which\n` +
          `  case the client config that uses it is broken) or it was rotated\n` +
          `  and this registry was not updated.`,
      );
    }
  }

  // 2 and 3. Per-key restrictions.
  for (const key of keys) {
    if (!registered.includes(key.uid)) continue;
    const r = key.restrictions ?? {};

    const actual = (r.apiTargets ?? []).map((t) => t.service);
    if (actual.length === 0) {
      failures.push(
        `UNRESTRICTED KEY on ${project}: "${key.displayName}" (${key.uid}).\n` +
          `  The key lists no API targets at all.\n` +
          `  The key is public by construction, so its API allowlist is what\n` +
          `  bounds which of the project's enabled APIs it can reach.\n` +
          `  Fix:\n${fixCommand(project, key, expected)}`,
      );
    } else {
      const { missing, unexpected } = diff(actual, expected);
      if (missing.length) {
        failures.push(
          `Missing API targets on ${project} key ${key.uid}:\n` +
            missing.map((s) => `    - ${s}: ${ALLOWED_APIS[s]}`).join("\n") +
            `\n  Fix:\n${fixCommand(project, key, expected)}`,
        );
      }
      if (unexpected.length) {
        failures.push(
          `Unexpected API targets on ${project} key ${key.uid}:\n` +
            unexpected.map((s) => `    - ${s}`).join("\n") +
            `\n  The client only calls the ${expected.length} services in\n` +
            `  ALLOWED_APIS. If one of these is genuinely needed now, add it\n` +
            `  there with the code path that calls it; otherwise this is a\n` +
            `  widening of a public key and should be removed.`,
        );
      }
    }

    // 3. No application restrictions.
    const appRestrictions = [
      ["browserKeyRestrictions", "HTTP referrer"],
      ["serverKeyRestrictions", "IP address"],
      ["androidKeyRestrictions", "Android app"],
      ["iosKeyRestrictions", "iOS app"],
    ].filter(([field]) => r[field]);

    for (const [field, label] of appRestrictions) {
      failures.push(
        `${label} restriction set on ${project} key ${key.uid} (${field}).\n` +
          `  Deliberately not used here. Referrer restrictions on a Firebase\n` +
          `  browser key break sign-in: the auth handler iframe does not\n` +
          `  reliably send a Referer header, so the restriction blocks\n` +
          `  some sign-in flows. API restrictions are the ones this\n` +
          `  guard holds. If you are adding this restriction on purpose,\n` +
          `  edit this guard and record why, having verified sign-in,\n` +
          `  sign-out, token refresh, Firestore reads and Storage\n` +
          `  uploads against it first.`,
      );
    }
  }

  if (failures.length) {
    console.error(`\nAPI key restriction guard: ${failures.length} problem(s) on ${project}\n`);
    for (const f of failures) console.error(`FAIL  ${f}\n`);
    process.exit(1);
  }

  console.log(
    `API key restrictions OK on ${project}: ${keys.length} key(s), ` +
      `each restricted to exactly ${expected.length} APIs, no app restrictions.`,
  );
}

main().catch((err) => {
  console.error(`FAIL  ${err.message}`);
  process.exit(2);
});
