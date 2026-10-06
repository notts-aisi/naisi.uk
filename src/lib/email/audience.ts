/**
 * WHO THIS COPY OF THE SITE MAY EMAIL.
 *
 * The same code runs as the live site, as the staging site, on a laptop and
 * inside the test harness, and every one of those can reach the real sender.
 * Only one of them should be able to write to a stranger. This module is the
 * answer to "which one am I", and `sendEmail()` in `./send.ts` asks it for
 * every message, after the suppression list and before anything is rendered.
 *
 * ## The rule
 *
 * 1. A copy of the site emails EVERYONE only when both of these hold:
 *     - its own environment carries `EMAIL_AUDIENCE=everyone`, a setting that
 *       exists on the live backend and nowhere else; and
 *     - it is running as the production project.
 *    Two conditions, because either one alone is a single mistake away from
 *    being true somewhere it should not be.
 * 2. When the mail server is this machine (a loopback address), everything is
 *    handed over, because nothing handed to a loopback catcher can leave it.
 *    That is the test harness, and the value read here is the one the
 *    transporter connects to, so this is a fact about the connection and not a
 *    flag somebody could set by hand on a server that reaches the real sender.
 * 3. Otherwise only the addresses LISTED in `EMAIL_AUDIENCE` receive mail,
 *    together with the harness's own reserved domain (below).
 * 4. A setting that is missing, empty or unreadable means NOBODY. Never
 *    everyone. `NODE_ENV` is not consulted anywhere: staging builds in
 *    production mode, so it cannot tell the two apart.
 *
 * A recipient outside the audience is HELD, not failed: the caller's work is
 * not wrong, this copy of the site is simply not allowed to write to that
 * address. `sendEmail()` leaves an `emailSends` row at status `held` for each
 * one, so a rehearsal on staging can still be counted.
 *
 * ## Why the setting is not in `apphosting.yaml`
 *
 * That file is read by BOTH backends, so a value written there is a value
 * staging inherits. The setting is therefore added on each backend itself, and
 * `tests/email-audience.test.mjs` fails if the shared file ever declares it.
 *
 * ## What this does not cover
 *
 * The sign-in provider's own verification and password-reset mail, which is
 * sent by the provider to the address the person at the keyboard typed, and
 * web push, which reaches only devices that subscribed on that copy of the
 * site.
 */

/** The environment variable. One name, read here and nowhere else. */
export const EMAIL_AUDIENCE_ENV = "EMAIL_AUDIENCE";

/** The one value of {@link EMAIL_AUDIENCE_ENV} that opens the door. */
export const EVERYONE = "everyone";

/**
 * The project the live site runs as. `tests/email-audience.test.mjs` holds
 * this to the project `apphosting.yaml` names, so renaming one without the
 * other fails a build instead of silently holding the live site's mail.
 */
export const PRODUCTION_PROJECT_ID = "naisi-uk";

/**
 * The harness's reserved domain. `.invalid` can never resolve (RFC 2606), so
 * an address under it cannot belong to anybody, and the suites that execute
 * the real send path address everything there.
 */
export const HARNESS_DOMAIN = "e2e.invalid";

/** Hosts that are this machine. A message handed to one of these stays here. */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Enough to tell an address from a stray word. Not a validator. */
const ADDRESS_SHAPE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export type EmailAudience =
  | {
      mode: "everyone";
      /** `production`: rule 1. `loopback`: rule 2. */
      because: "production" | "loopback";
    }
  | {
      mode: "listed";
      /** Lower-cased addresses this copy of the site may write to. */
      allow: ReadonlySet<string>;
      /**
       * `listed`: the setting named addresses. `unset`: there was no usable
       * setting. `not-production`: the setting said everyone, and this is not
       * the production project, so it was refused. `not-everyone`: this IS the
       * production project and the setting did not say everyone, which is a
       * live site holding its own mail and is reported loudly by the caller.
       */
      because: "listed" | "unset" | "not-production" | "not-everyone";
    };

type Env = Readonly<Record<string, string | undefined>>;

function isLoopback(host: string | undefined): boolean {
  return typeof host === "string" && LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

/** The addresses a setting names. Anything that is not address-shaped is dropped. */
function listedIn(setting: string): Set<string> {
  const allow = new Set<string>();
  for (const part of setting.split(/[\s,;]+/)) {
    const address = part.trim().toLowerCase();
    if (address && ADDRESS_SHAPE.test(address)) allow.add(address);
  }
  return allow;
}

/**
 * Decide the audience from an environment. Pure: the caller passes
 * `process.env`, and the tests pass a table.
 */
export function resolveEmailAudience(env: Env): EmailAudience {
  const setting = (env[EMAIL_AUDIENCE_ENV] ?? "").trim();
  const isProduction =
    (env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "").trim() === PRODUCTION_PROJECT_ID;
  const saysEveryone = setting.toLowerCase() === EVERYONE;

  if (saysEveryone && isProduction) return { mode: "everyone", because: "production" };
  if (isLoopback(env.SMTP_HOST)) return { mode: "everyone", because: "loopback" };

  if (saysEveryone) return { mode: "listed", allow: new Set(), because: "not-production" };
  const allow = listedIn(setting);
  if (isProduction) return { mode: "listed", allow, because: "not-everyone" };
  return { mode: "listed", allow, because: allow.size > 0 ? "listed" : "unset" };
}

/** True for an address under the harness's reserved domain. */
function isHarnessAddress(address: string): boolean {
  return address.endsWith(`@${HARNESS_DOMAIN}`);
}

export type AudienceVerdict = {
  /** Addresses this copy of the site may write to, as they were given. */
  allowed: string[];
  /** Addresses it may not. Held, not failed. */
  held: string[];
};

/**
 * Split a list of addresses by the audience. Order is kept and the original
 * spelling is returned, because both halves are logged as they were addressed.
 */
export function splitByAudience(
  addresses: readonly string[],
  audience: EmailAudience,
): AudienceVerdict {
  if (audience.mode === "everyone") return { allowed: [...addresses], held: [] };
  const allowed: string[] = [];
  const held: string[] = [];
  for (const given of addresses) {
    const address = given.trim().toLowerCase();
    if (audience.allow.has(address) || isHarnessAddress(address)) allowed.push(given);
    else held.push(given);
  }
  return { allowed, held };
}

/** Why a held row was held, as the deliverability tab shows it. */
export const HELD_REASON = "this copy of the site does not email this address";

/**
 * True when the audience is a live site holding its own mail: the production
 * project without the setting that opens the door. Everything else in
 * `listed` mode is a copy of the site behaving as intended.
 */
export function isMisconfiguredProduction(audience: EmailAudience): boolean {
  return audience.mode === "listed" && audience.because === "not-everyone";
}
