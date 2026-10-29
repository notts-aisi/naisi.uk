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
 * WHAT IT ASSERTS, in four parts.
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
 *  4. The project's DEFAULT web key is the one KNOWN_KEYS marks
 *     `projectDefault`, and it exists. Firebase writes the default key, not
 *     the bundle's, into the link of every email it sends for the project
 *     (password reset, email verification), and the page that link opens
 *     calls Firebase with it. The two keys can differ, so a default key can
 *     be deleted while the site keeps working, and then every one of those
 *     links opens a page saying it has expired. Parts 1 to 3 cannot see that:
 *     a deleted key is simply not listed, and nothing else said which key the
 *     emails depend on. A deleted key can be restored for 30 days.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It reads exactly one key string, the
 * project's default key, from the sign-in settings, and only to ask which key
 * it is. Firebase already writes that string into every email it sends, so it
 * is no more secret than the bundle's key. It is never printed, and a failure
 * of the call that carries it is reported by its status alone. `keys.list`
 * does not return `keyString` (only `getKeyString` does, and this never calls
 * it), so a compromised run of this guard leaks nothing that is not already
 * public.
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
 * `projectDefault` marks the one key per project that the project's sign-in
 * settings name as its web key: the key Firebase writes into its email links
 * (part 4 in the header). It is often the bundle's key too, as on dev. It does
 * not have to be, as on production, and then it looks unused from the code.
 *
 * Note there is no FCM entry anywhere below. Web push here uses the `web-push`
 * package over raw VAPID straight to the browser vendor's push service
 * (src/lib/push/send.ts), not the Firebase Messaging SDK, so no FCM API is
 * reachable with this key and none needs to be.
 */
const KNOWN_KEYS = {
  "9ec6bab3-b9f3-4c91-bccb-d3ad22409221": {
    project: "naisi-uk-dev",
    projectDefault: true,
    purpose:
      "The dev project's Firebase web key, inlined into the client bundle as " +
      "NEXT_PUBLIC_FIREBASE_API_KEY and served from dev.naisi.uk. Also the " +
      "project's default key, so Firebase's email links carry it.",
  },
  "ea591e1a-5447-469e-946a-038ddca9264a": {
    project: "naisi-uk",
    purpose:
      "The production Firebase web key, same role, served from naisi.uk.",
  },
  "de23f0c7-d5d2-407e-b0a2-6b6f49b69d9a": {
    project: "naisi-uk",
    projectDefault: true,
    purpose:
      "The production project's DEFAULT web key. The site does not use it, " +
      "but Firebase writes it into the link of every email it sends for the " +
      "project (password reset, email verification), and the page that link " +
      "opens calls Firebase with it. Deleting it breaks every one of those " +
      "links while the site carries on working. Never delete it.",
  },
  "b7f75922-4988-492d-a4f2-e67db5bc56d5": {
    project: "naisi-website",
    projectDefault: true,
    purpose:
      "The Firebase web key of the previous production project, which serves " +
      "nothing now. Listed so that the project is held to the same allowlist " +
      "as every other project for as long as it exists. The only key that " +
      "project holds, so its default unless the default was deleted, which " +
      "a run against it reports.",
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

async function getClient() {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  return auth.getClient();
}

async function listKeys(client, project) {
  const url = `https://apikeys.googleapis.com/v2/projects/${project}/locations/global/keys`;
  const res = await client.request({ url });
  return res.data.keys ?? [];
}

/**
 * Which key the project's sign-in settings name as its web key (part 4 in the
 * header). The settings give only the key's string, so this asks the API keys
 * service which key that is. The string travels in the second request's
 * address, so neither request's error is passed on: the caller gets the step
 * and the HTTP status, never the message, which can quote the request.
 *
 * Returns `{ uid }`, `{ uid: null, why: "unnamed" }` when the settings name no
 * key, or `{ uid: null, why: "gone" }` when they name one that no longer
 * exists even as a deleted key.
 */
async function readDefaultKey(client, project) {
  const fail = (step, err, role) => {
    const status = err?.response?.status ?? "no response";
    const hint =
      status === 403
        ? `\n  The caller needs ${role} on the project. In CI that is the\n` +
          `  identity the workflow signs in as; locally it is you.`
        : "";
    return new Error(`could not ${step} for ${project} (HTTP ${status})${hint}`);
  };

  let keyString;
  try {
    const res = await client.request({
      url: `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`,
    });
    keyString = res.data?.client?.apiKey;
  } catch (err) {
    throw fail("read the sign-in settings", err, "roles/firebaseauth.viewer");
  }
  if (!keyString) return { uid: null, why: "unnamed" };

  try {
    const res = await client.request({
      url: "https://apikeys.googleapis.com/v2/keys:lookupKey",
      params: { keyString },
    });
    const uid = String(res.data?.name ?? "").split("/").pop();
    return uid ? { uid } : { uid: null, why: "gone" };
  } catch (err) {
    if (err?.response?.status === 404) return { uid: null, why: "gone" };
    throw fail("look up the default key", err, "roles/serviceusage.apiKeysViewer");
  }
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

  let client;
  let keys;
  try {
    client = await getClient();
    keys = await listKeys(client, project);
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

  let defaultKey;
  try {
    defaultKey = await readDefaultKey(client, project);
  } catch (err) {
    // Loud for the same reason as above.
    console.error(`FAIL  ${err.message}`);
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
          `  with what it is for. ` +
          (uid === defaultKey.uid
            ? `This one is the project's DEFAULT web key, which\n` +
              `  Firebase's email links depend on even when no code uses it (part\n` +
              `  4 in the header). Register it with projectDefault: true. Do NOT\n` +
              `  delete it.`
            : `If this key is legitimate, add it and say why.\n` +
              `  If it is not, it should not exist: delete it.`),
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

  // 4. The default key: marked in the registry, and present on the project.
  const marked = registered.filter((uid) => KNOWN_KEYS[uid].projectDefault);
  if (marked.length !== 1) {
    failures.push(
      `KNOWN_KEYS marks ${marked.length} keys on ${project} as projectDefault.\n` +
        `  Exactly one key per project is its default web key: mark the one\n` +
        `  the project's sign-in settings name.`,
    );
  }
  if (defaultKey.uid === null) {
    failures.push(
      defaultKey.why === "unnamed"
        ? `The sign-in settings of ${project} name no default web key.\n` +
            `  Firebase writes the default key into every email link it sends\n` +
            `  for the project, so those links cannot work.`
        : `The default web key of ${project} no longer exists, not even as a\n` +
            `  deleted key, so it cannot be restored. Firebase writes it into\n` +
            `  every email link it sends for the project (password reset, email\n` +
            `  verification), and every one of those links fails until the\n` +
            `  project's email links stop depending on it.`,
    );
  } else {
    if (!marked.includes(defaultKey.uid)) {
      failures.push(
        `The default web key of ${project} is ${defaultKey.uid}, which KNOWN_KEYS\n` +
          `  does not mark as projectDefault (it marks ${marked.join(", ") || "none"}).\n` +
          `  Firebase writes the default key into every email link it sends for\n` +
          `  the project, and the page the link opens calls Firebase with it.\n` +
          `  Register it with projectDefault: true and say what it is for.`,
      );
    }
    if (!seen.includes(defaultKey.uid)) {
      failures.push(
        `The default web key of ${project} (${defaultKey.uid}) is DELETED.\n` +
          `  Firebase writes it into the link of every email it sends for the\n` +
          `  project (password reset, email verification), so every one of those\n` +
          `  links now opens a page saying it has expired, while sign-in on the\n` +
          `  site still works. A deleted key can be restored for 30 days:\n` +
          `    gcloud services api-keys undelete ${defaultKey.uid} --project=${project}\n` +
          `  then run this guard again: a restored key keeps the restrictions it\n` +
          `  had when it was deleted.`,
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
      `each restricted to exactly ${expected.length} APIs, no app restrictions, ` +
      `default key ${defaultKey.uid} present.`,
  );
}

main().catch((err) => {
  console.error(`FAIL  ${err.message}`);
  process.exit(2);
});
