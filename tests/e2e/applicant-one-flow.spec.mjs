/**
 * A visitor with no account applies in one flow, end to end, in a real browser.
 *
 * The term's application form -> its first step, About you, which for somebody
 * with no account is their join request -> Continue, which is held until the
 * answers are complete and the terms agreed to -> an email address, given on
 * the same page -> the confirmation read out of the inbox and its link driven
 * in a tab of its own, where a password is chosen -> back in the first tab,
 * which has noticed the sign-in and still holds every answer, one press sends
 * the join request and moves on to the second step -> the rest of the form ->
 * a Send that is held while the university address is unchecked -> the
 * university link read out of the inbox and followed -> the application sent.
 *
 * Nothing is typed twice, and the register page's own profile form is never
 * filled in: that is the whole of what this spec exists to hold.
 *
 * ## The link's tab is left the answers, and the first tab is where the journey continues
 *
 * The emailed link opens in a tab of its own, as it does for a person. That
 * tab is held to one ending: this form, at the address the form itself marked
 * for the way back, with every answer typed in the first tab already in its
 * boxes. Somebody who continues with an email address is left a copy of what
 * they typed where the link's tab can read it (the browser's local storage,
 * which the two tabs share), for an hour at most and until the join request
 * has gone. It never ends on the register page's profile form, which would
 * ask the same questions again.
 *
 * The spec then carries on in the first tab, which still holds its own copy.
 * So both places a person can finish from are held: the link's tab is ready,
 * and the tab they started in still works.
 *
 * ## Nothing here is seeded except the form
 *
 * The fixture creates ONE application form. The account is the product's to
 * make, through the same routes a person's is: `/api/register`, the emailed
 * link, `/api/register/password-set`, and the join request's own client write
 * of `users/{uid}` at role `pending`. A seeded account would skip every one of
 * those legs.
 *
 * ## LOCAL MODE ONLY, and that is a property rather than a limitation
 *
 * Two presses below make the server SEND, and the second sends to an
 * `@nottingham.ac.uk` address, which is a real domain. So every step but the
 * first is on the fixture's `RECAPTCHA_DEPENDENT_STEPS` and is skipped against
 * a deployed target, the register press refuses to run unless the RUNNER said
 * this run's mail is caught, and before the press that makes the server
 * address the university address the spec PROVES a `.invalid` message really
 * reached the local catcher. An env var saying "a runner started me" is a
 * promise; a message sitting in the catcher is a fact.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec applicant-one-flow
 *
 * ## CHROMIUM ONLY
 *
 * Playwright drives Chromium here and nothing else. Google sign-in is not
 * automatable at all by design, so the Google way on this step, which is the
 * one with no trip to an inbox, is untested by construction. A green run is a
 * REGRESSION NET, never a substitute for the manual pass on a phone and in
 * Safari before dev goes to main.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTarget } from "../../scripts/e2e/lib/env.mjs";
import { harnessUserByEmail } from "../../scripts/e2e/lib/admin.mjs";
import { readUserDoc } from "../../scripts/e2e/lib/firestore.mjs";
import {
  createStepRecorder,
  openBrowser,
  stubRecaptchaOnLoopback,
  waitForRecaptchaWidget,
} from "../../scripts/e2e/lib/browser.mjs";
import {
  getMessage,
  hrefUrls,
  proveSmtpReachesMailpit,
  waitForMessagesTo,
} from "../../scripts/e2e/lib/mailpit.mjs";
import {
  ARTIFACTS_DIR,
  RECAPTCHA_SKIP_REASON,
  applicationId,
  fixtureDoc,
  fixtureQuery,
  markerPath,
  statePath,
  readState,
  stateDir,
} from "../../scripts/e2e-fixtures/core.mjs";
import {
  RECAPTCHA_DEPENDENT_STEPS,
  SPEC,
} from "../../scripts/e2e-fixtures/applicant-one-flow.mjs";

/**
 * Where this run's ledger and marker live. The runner hands every child an
 * `E2E_STATE_DIR`, and `stateDir()` is the one place that reads it.
 */
const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a shared harness server
 *  compiles each route on its first request. */
const WAIT_MS = 30_000;

/** How long a message may take to reach the catcher, for the same reason. */
const MAIL_WAIT_MS = 30_000;

/** What the visitor types. Each is asserted again after the trip to the inbox. */
const TYPED = {
  name: "E2E one flow",
  degree: "BSc Mathematics",
  status: "undergraduate",
};

/**
 * Why a step may not run in this mode, or null. Decided once the target is
 * known: against a deployed target the real widget challenges headless
 * Chromium and the sends would be real.
 */
let skipReasonFor = () => null;

/** The one reason this file may record for a step it did not run. */
const DEPLOYED_TARGET_SKIP = RECAPTCHA_SKIP_REASON;

/** Through `readState`, never the ledger file itself: the ledger holds no credential. */
function loadState() {
  return readState(SPEC.name, RUN_STATE_DIR);
}

/**
 * Playwright is NOT a dependency of this repo, deliberately. So it is resolved
 * at runtime and a missing one is a SKIP with the install line, not a red
 * suite.
 */
async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

const state = loadState();
const playwright = await loadPlaywright();

const skipReason = !playwright
  ? "Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium"
  : !state
    ? `No one-flow fixture at ${STATE_PATH}. Run: node scripts/run-e2e.mjs --spec applicant-one-flow.`
    : null;

/** The origin under test, through the harness's own allowlist. */
function baseUrl() {
  return assertTarget(process.env.E2E_TARGET ?? "https://dev.naisi.uk");
}

/** The one verification link in an email body, asserted to be unambiguous. */
function verificationLink(message, origin) {
  const links = [
    ...new Set(hrefUrls(message.HTML).filter((l) => l.startsWith(`${origin}/verify-email/`))),
  ];
  assert.equal(
    links.length,
    1,
    `expected exactly one ${origin}/verify-email/ link in the email, found ` +
      `${links.length}. None means the link points at another origin, so ` +
      "NEXT_PUBLIC_APP_URL is not what this server is serving on.",
  );
  return links[0];
}

/** The account the register route made for this run's address, or null. */
async function accountFor(email) {
  return (await harnessUserByEmail(email).catch(() => null)) ?? null;
}

/**
 * Wait for a box to hold `expected`. The first step fills its boxes from what
 * the browser kept once the page is listening, and draws them afresh when it
 * does, so the box is found again on every look.
 */
async function holds(box, expected, what) {
  const until = Date.now() + WAIT_MS;
  let found = await box.inputValue({ timeout: WAIT_MS });
  while (found !== expected && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    found = await box.inputValue({ timeout: WAIT_MS });
  }
  assert.equal(found, expected, `the link's tab was not left ${what} typed in the first tab`);
}

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "applicant in one flow: no account, the form's first step is the join request, and the application sends",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const formPath = `/apply/${state.roundId}`;
    const formUrl = `${origin}/apply/${encodeURIComponent(state.roundId)}`;
    const graduation = `${new Date().getFullYear() + 2}-06`;
    const motivation = `One-flow run ${state.oneFlowRunId}: written by an automated run.`;

    const { browser, context, page } = await openBrowser();
    const recorder = createStepRecorder({
      t,
      page,
      markerPath: MARKER,
      artifactsDir: ARTIFACTS_DIR,
      // Read through a closure: the mode is only known once the stub has had
      // its say, a few lines below this.
      skipReasonFor: (name) => skipReasonFor(name),
    });
    const step = (name, fn) => recorder.step(name, fn);
    // /api/register is reCAPTCHA-gated, and the helper hands the widget a
    // token to send where it can (see scripts/e2e/lib/browser.mjs).
    const recaptchaStubbed = await stubRecaptchaOnLoopback(page, origin);
    console.log(
      `[one-flow-spec] reCAPTCHA: ${recaptchaStubbed ? `armed (${recaptchaStubbed})` : "real widget (deployed target)"}`,
    );
    if (!recaptchaStubbed) {
      skipReasonFor = (name) =>
        RECAPTCHA_DEPENDENT_STEPS.includes(name) ? DEPLOYED_TARGET_SKIP : null;
      console.log(
        `[one-flow-spec] ${RECAPTCHA_DEPENDENT_STEPS.length} reCAPTCHA-dependent step(s) will be ` +
          "SKIPPED against this target and reported as such. Run with --local to drive them.",
      );
    }

    // The laptop layout's one button for moving on. The phone's own copy of it
    // is in the page too, hidden by CSS at this width, and a role query does
    // not see a hidden control. The name is matched exactly: on a development
    // server the framework draws a button of its own whose name starts with
    // the same word.
    const next = page.getByRole("button", { name: "Next", exact: true });

    try {
      await step(
        "a visitor with no account is shown the form's first step, and nothing else of the form",
        async () => {
          await page.goto(formUrl, { waitUntil: "domcontentloaded" });
          await page.getByRole("heading", { name: "About you" }).waitFor({ timeout: WAIT_MS });
          await page
            .getByText("You don’t have an account yet, so this step is your join request too.", {
              exact: false,
            })
            .waitFor({ timeout: WAIT_MS });
          for (const label of [
            "Preferred name",
            "University email",
            "What do you do at UoN?",
            "Why are you interested in AI safety?",
          ]) {
            await page.getByLabel(label).waitFor({ timeout: WAIT_MS });
          }
          // The step is the join request, so nobody is sent away to make one.
          assert.equal(
            await page.getByRole("link", { name: "Join NAISI" }).count(),
            0,
            "the form still sends a visitor to the register page to join",
          );
          // And nothing else of the form reaches a visitor: not on the screen,
          // and not in the page that was sent. A client component's props are
          // serialised into the HTML, so the source is read as well.
          const html = await page.content();
          for (const withheld of [state.programmeName, state.questionText]) {
            assert.equal(
              await page.getByText(withheld, { exact: false }).count(),
              0,
              `a signed-out visitor was shown "${withheld}"`,
            );
            assert.equal(
              html.includes(withheld),
              false,
              `"${withheld}" is in the page a signed-out visitor was sent`,
            );
          }
          assert.equal(
            await page.getByRole("button", { name: "Send application" }).count(),
            0,
            "a signed-out visitor was offered Send",
          );
        },
      );

      await step(
        "Continue is held until the join request is complete and the terms are agreed to",
        async () => {
          await next.click();
          await page
            .getByText("A few things to finish before you continue.")
            .waitFor({ timeout: WAIT_MS });
          for (const sentence of [
            "Tell us what to call you.",
            "Add your university email.",
            "Tell us what you do at UoN.",
            "Tell us why you are interested in AI safety.",
            "Please agree to the Terms of Use and Privacy Policy to continue.",
          ]) {
            await page.getByText(sentence).waitFor({ timeout: WAIT_MS });
          }
          assert.equal(
            await page.getByRole("heading", { name: "Make your account" }).count(),
            0,
            "the step offered a way to make an account before its answers were complete",
          );

          // Typed here, and sent nowhere: no request leaves this page with an
          // answer in it until there is a session. The gate that proves the
          // mail is caught stands before the press that makes the server
          // address the university address, four steps on.
          await page.getByLabel("Preferred name").fill(TYPED.name);
          await page.getByLabel("University email").fill(state.uniEmail);
          await page.getByLabel("What do you do at UoN?").selectOption(TYPED.status);
          await page.getByLabel("Degree").fill(TYPED.degree);
          await page.getByLabel("Expected graduation").selectOption(graduation);
          await page.getByLabel("Why are you interested in AI safety?").fill(motivation);

          // Complete answers are not enough without the consent box.
          await next.click();
          await page
            .getByText("Please agree to the Terms of Use and Privacy Policy to continue.")
            .waitFor({ timeout: WAIT_MS });
          await page.getByText("Tell us what to call you.").waitFor({ state: "detached", timeout: WAIT_MS });
          assert.equal(
            await page.getByRole("heading", { name: "Make your account" }).count(),
            0,
            "the step offered a way to make an account without the terms being agreed to",
          );
          assert.equal(
            await accountFor(state.loginEmail),
            null,
            "an account exists before the visitor has asked for one",
          );
          await page.locator("#join-consent").check();
        },
      );

      await step("Continue then offers the two ways to make an account, on the same page", async () => {
        await next.click();
        await page.getByRole("heading", { name: "Make your account" }).waitFor({ timeout: WAIT_MS });
        assert.equal(
          new URL(page.url()).pathname,
          formPath,
          "making an account took the visitor off the form",
        );
        await page.locator("#join-email").waitFor({ timeout: WAIT_MS });
        // No password is asked for on this page: the account is made with one
        // nobody knows, and the person chooses theirs after the emailed link.
        assert.equal(
          await page.locator('input[type="password"]').count(),
          0,
          "the form's own page asked for a password",
        );
        // Somebody who already has an account is sent to sign in and brought
        // back to this form, and nowhere else. The step's own link, which is
        // inside the page's main area: the site's header has one of the same
        // name that goes to the bare sign-in page. What it carries is the
        // address the form marks for the way back (`?join=1`), the one the
        // emailed link returns to further down, so the sign-in page sends an
        // account with no join request back to this step and not on to the
        // register page's own profile form.
        const signIn = page.locator("main").getByRole("link", { name: "Sign in", exact: true });
        assert.equal(
          await signIn.getAttribute("href"),
          `/login?next=${encodeURIComponent(`${formPath}?join=1`)}`,
          "the sign-in link does not carry this form's marked address as its return address",
        );
      });

      await step(
        "giving an email address sends the confirmation and says to come back to this tab",
        async () => {
          // THE REFUSAL. `suppress` is the runner's answer to "could a send
          // from this target reach a real sender", and only `false` means the
          // local catcher takes it. Loopback is NOT that fact.
          assert.equal(
            state.suppress,
            false,
            "this run's mail is NOT caught, so pressing Continue with email would make " +
              "the server hand a real sender a fixture address. Run this spec through " +
              "scripts/run-e2e.mjs --local, or against the reserved harness port.",
          );

          await page.locator("#join-email").fill(state.loginEmail);
          // The submit is reCAPTCHA-gated and the widget mounts a beat after
          // this half of the step is drawn. A person never wins that race; a
          // spec always does unless it waits.
          await waitForRecaptchaWidget(page, { timeout: WAIT_MS });
          await page.getByRole("button", { name: "Continue with email" }).click();
          // The same answer whether or not the address was already registered.
          await page.getByRole("heading", { name: "Check your inbox" }).waitFor({ timeout: WAIT_MS });
          await page.getByText(state.loginEmail, { exact: false }).first().waitFor({ timeout: WAIT_MS });
          await page
            .getByText("then come back to this tab", { exact: false })
            .waitFor({ timeout: WAIT_MS });
          assert.equal(new URL(page.url()).pathname, formPath, "the visitor was taken off the form");
        },
      );

      await step(
        "the emailed link confirms the address and a password is chosen, in a tab of its own",
        async () => {
          const [summary] = await waitForMessagesTo(state.loginEmail, {
            count: 1,
            timeoutMs: MAIL_WAIT_MS,
          });
          const message = await getMessage(summary.ID);
          assert.equal(
            message.Subject,
            "Confirm your email to finish joining NAISI",
            "the register route sent something other than the confirmation email",
          );

          // A SECOND TAB, because that is where a link in an email opens. The
          // first tab is left exactly as the visitor left it.
          const inbox = await context.newPage();
          try {
            await inbox.goto(verificationLink(message, origin), { waitUntil: "domcontentloaded" });
            await inbox.getByRole("heading", { name: "Set your password" }).waitFor({ timeout: WAIT_MS });
            await inbox.locator("#set-password").fill(state.password);
            await inbox.getByRole("button", { name: "Set password & continue" }).click();
            // The landing page signs in again after the password is saved, and
            // only then moves on, so leaving it is what says both happened.
            await inbox.waitForURL((url) => !url.pathname.startsWith("/verify-email/"), {
              timeout: WAIT_MS,
            });
            // It moves on to THIS FORM, at the address the form marked for the
            // way back, and nowhere else. A registration that began on a form
            // is never handed to the register page's own profile form: the
            // form's first step is where this person's join request is made.
            const landed = new URL(inbox.url());
            assert.equal(
              `${landed.pathname}${landed.search}`,
              `${formPath}?join=1`,
              "the emailed link did not bring a registration that began on this form " +
                "back to the form",
            );
            // THIS TAB HOLDS WHAT WAS TYPED IN THE FIRST ONE. Continuing with
            // an email address left a copy where the link's tab can read it,
            // so nothing is asked a second time here either. The boxes are
            // filled once the page is listening, so each is waited for.
            await inbox.getByRole("heading", { name: "About you" }).waitFor({ timeout: WAIT_MS });
            await holds(inbox.getByLabel("Preferred name"), TYPED.name, "the name");
            await holds(inbox.getByLabel("University email"), state.uniEmail, "the university address");
            await holds(inbox.getByLabel("What do you do at UoN?"), TYPED.status, "the status");
            await holds(inbox.getByLabel("Degree"), TYPED.degree, "the degree");
            await holds(inbox.getByLabel("Expected graduation"), graduation, "the graduation date");
            await holds(
              inbox.getByLabel("Why are you interested in AI safety?"),
              motivation,
              "the reason for joining",
            );
            // So the step has nothing to say about another tab. That line is
            // for a tab that was left no answers, and this one has them.
            assert.equal(
              await inbox
                .getByText("If you started this form in another tab", { exact: false })
                .count(),
              0,
              "the link's tab holds the answers and still says they are in another tab",
            );
            // Agreeing is a fresh act in every tab: it never crosses.
            assert.equal(
              await inbox.locator("#join-consent").isChecked(),
              false,
              "the tick that agrees to the terms was carried into the link's tab",
            );
          } finally {
            await inbox.close();
          }
        },
      );

      await step(
        "the first tab sees the sign-in, still holds every answer, and one press sends the join request",
        async () => {
          // Nobody has touched this tab. It learns of the sign-in from the
          // browser, asks the server what the account is, and says so.
          await page
            .getByText(`Signed in as ${state.loginEmail}`, { exact: false })
            .waitFor({ timeout: WAIT_MS });
          await page.getByRole("heading", { name: "About you" }).waitFor({ timeout: WAIT_MS });

          // EVERYTHING TYPED IS STILL HERE. This is the assertion the journey
          // is for: nothing is asked a second time.
          assert.equal(await page.getByLabel("Preferred name").inputValue(), TYPED.name);
          assert.equal(await page.getByLabel("University email").inputValue(), state.uniEmail);
          assert.equal(await page.getByLabel("What do you do at UoN?").inputValue(), TYPED.status);
          assert.equal(await page.getByLabel("Degree").inputValue(), TYPED.degree);
          assert.equal(await page.getByLabel("Expected graduation").inputValue(), graduation);
          assert.equal(
            await page.getByLabel("Why are you interested in AI safety?").inputValue(),
            motivation,
          );

          // THE GATE, before the press that makes the server address a real
          // domain. The confirmation above went to a `.invalid` address unique
          // to this run, so a message sitting in the catcher for it can only
          // have been put there by the server under test. Re-triggering would
          // be refused by the register route's cooldown, so the trigger here
          // does nothing.
          const smtpSkip = await proveSmtpReachesMailpit(state.loginEmail, async () => {});
          assert.equal(
            smtpSkip,
            null,
            `refusing to address ${state.uniEmail}: ${smtpSkip}. That is a real domain, ` +
              "and a server whose SMTP is not the local catcher would send for real.",
          );

          // Agreeing is never remembered for somebody, so it is ticked here
          // whether or not the page kept it.
          await page.locator("#join-consent").check();
          await next.click();

          // Straight on to the form's second step, on the form's own address.
          await page.waitForURL(
            (url) => url.pathname === formPath && url.searchParams.get("step") === "choose",
            { timeout: WAIT_MS },
          );
          await page
            .getByRole("heading", { name: "What would you like to do?" })
            .waitFor({ timeout: WAIT_MS });
          await page
            .getByRole("group", { name: "Programmes you’re interested in" })
            .waitFor({ timeout: WAIT_MS });
        },
      );

      await step(
        "the join request is a waiting account with an unchecked university address, and About you is on the application",
        async () => {
          const account = await accountFor(state.loginEmail);
          assert.ok(account, `no Auth account exists for ${state.loginEmail}`);
          const doc = await readUserDoc(account.uid);
          assert.ok(
            doc,
            "the form moved on without writing users/{uid}, so the account has no join " +
              "request behind it",
          );
          assert.equal(doc.role, "pending", "a join request came out at a role other than pending");
          assert.equal(doc.profile?.preferredName, TYPED.name);
          assert.equal(doc.profile?.universityEmail, state.uniEmail);
          assert.equal(doc.profile?.subject, TYPED.degree);
          assert.equal(doc.profile?.expectedGraduation, graduation);
          assert.equal(doc.profile?.motivation, motivation);
          assert.equal(
            doc.profile?.uniEmailVerifiedAt ?? null,
            null,
            "the join request claimed a university address nobody has checked",
          );
          // Nobody was offered the newsletter or event email on this step, so
          // nobody was subscribed to them.
          assert.equal(doc.profile?.notifications?.categories?.newsletter, false);
          assert.equal(doc.profile?.notifications?.categories?.events, false);
          assert.ok(doc.policyVersion, "the join request recorded no agreement to the terms");

          // The same answers, copied into the application, which now exists.
          const application = await fixtureDoc(
            "admissionApplications",
            applicationId(state.roundId, account.uid),
          ).get();
          assert.ok(application.exists, "the join request did not start an application");
          assert.equal(application.get("status"), "draft");
          assert.equal(application.get("draft.aboutYou.preferredName"), TYPED.name);
          assert.equal(application.get("draft.aboutYou.universityEmail"), state.uniEmail);
          assert.equal(application.get("draft.aboutYou.universityEmailVerified"), false);
          assert.equal(application.get("draft.aboutYou.motivation"), motivation);

          // And the link that checks the university address is on its way.
          const [summary] = await waitForMessagesTo(state.uniEmail, {
            count: 1,
            timeoutMs: MAIL_WAIT_MS,
          });
          assert.equal(
            (await getMessage(summary.ID)).Subject,
            "Verify your university email for NAISI",
            "the send route sent the already-registered notice, so this address is " +
              "verified on another account: a previous run's teardown left one behind",
          );
        },
      );

      await step("the rest of the form is filled in and saved", async () => {
        // The button for moving on is disabled until the form is listening, so
        // an enabled one says a press on a card will be heard. A tick made
        // before that is drawn by the browser and lost to the page.
        await next.and(page.locator(":enabled")).waitFor({ timeout: WAIT_MS });
        // The card is a label around a tick box, so pressing its name ticks it.
        await page.getByText(state.programmeName, { exact: true }).click();
        await page.getByRole("checkbox", { name: state.programmeName }).and(page.locator(":checked")).waitFor({
          timeout: WAIT_MS,
        });
        await next.click();
        await page.getByLabel(state.questionText).fill("To see whether the arguments hold up.");
        await next.click();
        // Availability is not required, and painting it is the funnel spec's
        // business. This step is passed through.
        await page.getByRole("heading", { name: "When are you free?" }).waitFor({ timeout: WAIT_MS });
        await next.click();
        await page.getByRole("heading", { name: "Check and send" }).waitFor({ timeout: WAIT_MS });
        // A real radio, drawn by the label around it: it is the control under
        // the pointer, so it is the thing to press.
        await page.getByRole("radio", { name: "Not yet", exact: true }).check();
        // Saved is what the form says once the server holds what is on screen.
        await page.getByRole("status").filter({ hasText: "Saved" }).first().waitFor({ timeout: WAIT_MS });
      });

      await step("Send is held, and says why, while the university address is unchecked", async () => {
        // Said before anything is pressed.
        await page
          .getByText("Check your university email before you send.")
          .waitFor({ timeout: WAIT_MS });
        await page.getByText(state.uniEmail, { exact: false }).first().waitFor({ timeout: WAIT_MS });
        await page.getByRole("button", { name: "Send the link again" }).first().waitFor({ timeout: WAIT_MS });

        await page.getByRole("button", { name: "Send application" }).click();
        // The form asks the server before it gives up, and then puts the
        // reader on the notice that says what is holding the send. That focus
        // is what says the press was answered rather than still on its way.
        await page.waitForFunction(
          () =>
            (document.activeElement?.textContent ?? "").includes(
              "Check your university email before you send.",
            ),
          undefined,
          { timeout: WAIT_MS },
        );
        // Still on the last step, still unsent.
        await page
          .getByRole("button", { name: "Send application" })
          .and(page.locator(":enabled"))
          .waitFor({ timeout: WAIT_MS });
        assert.equal(
          await page.getByRole("heading", { name: "Application sent." }).count(),
          0,
          "an application was sent from a waiting account whose university address " +
            "nobody has checked",
        );
        const account = await accountFor(state.loginEmail);
        const application = await fixtureDoc(
          "admissionApplications",
          applicationId(state.roundId, account.uid),
        ).get();
        assert.equal(application.get("status"), "draft");
        assert.equal(application.get("sent") ?? null, null);
      });

      await step("the university link is followed and the same application sends", async () => {
        const [summary] = await waitForMessagesTo(state.uniEmail, {
          count: 1,
          timeoutMs: MAIL_WAIT_MS,
        });
        const message = await getMessage(summary.ID);
        // In a tab of its own, in the browser that is signed in: the link only
        // counts when the account that asked for it is the one that opens it.
        const inbox = await context.newPage();
        try {
          await inbox.goto(verificationLink(message, origin), { waitUntil: "domcontentloaded" });
          await inbox
            .getByRole("heading", { name: "University email verified" })
            .waitFor({ timeout: WAIT_MS });
        } finally {
          await inbox.close();
        }

        // Back on the form, the same press now goes: the form asks the server
        // again before it sends, so nothing has to be reloaded.
        await page.getByRole("button", { name: "Send application" }).click();
        await page.getByRole("heading", { name: "Application sent." }).waitFor({ timeout: WAIT_MS });
      });

      await step(
        "the application is the committee's to read, and every address has its send rows",
        async () => {
          const account = await accountFor(state.loginEmail);
          const application = await fixtureDoc(
            "admissionApplications",
            applicationId(state.roundId, account.uid),
          ).get();
          assert.equal(application.get("status"), "submitted");
          assert.deepEqual(application.get("sent.rankedProgrammeIds"), [state.programmeId]);
          assert.equal(application.get("sent.aboutYou.preferredName"), TYPED.name);
          assert.equal(
            application.get("sent.aboutYou.universityEmailVerified"),
            true,
            "the application of record does not say the university address was checked",
          );
          assert.equal(
            application.get(`sent.answers.${state.questionSetId}.${state.questionId}`),
            "To see whether the arguments hold up.",
          );

          // Still a waiting account: sending an application approves nobody.
          const doc = await readUserDoc(account.uid);
          assert.equal(doc.role, "pending");
          assert.ok(doc.profile?.uniEmailVerifiedAt, "following the link did not stamp the account");

          // The send log is the evidence a route really sent, and both
          // addresses must carry one: the confirmation to the sign-in address,
          // the check to the university one.
          for (const address of [state.loginEmail, state.uniEmail]) {
            const rows = await fixtureQuery("emailSends").where("to", "==", address).get();
            assert.ok(
              rows.size >= 1,
              `no emailSends row for ${address}. The catcher holds the message, so the ` +
                "send happened and the log write is what did not.",
            );
          }
        },
      );
    } finally {
      await context.close();
      await browser.close();
      recorder.writeMarker();
    }
  },
);
