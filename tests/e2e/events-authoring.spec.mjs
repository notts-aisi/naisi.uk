/**
 * Events authoring, end to end, in a real browser: an event for chosen people.
 *
 * Sign in as the admin -> approve the two people of this journey -> Manage
 * events -> New event -> its basics and a description -> Who's it for: only
 * the invitee, by name -> send it for approval, approve it, publish it -> a
 * signed-out visitor and the events page see nothing of it -> the invitee
 * finds it on Home and asks for a place -> a member who was not invited is
 * told it is only for the people invited to it.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --spec events-authoring            # deployed dev
 *   npm run e2e:browser -- --local --spec events-authoring    # its own server
 *
 * `scripts/run-e2e.mjs` seeds two waiting accounts (see
 * `scripts/e2e-fixtures/events-authoring.mjs`), leaves them in a state file
 * under `.e2e-state/`, and tears everything down afterwards, the event the
 * admin makes included, by its title.
 *
 * ## Not yet run
 *
 * Written beside the editor's new step and marked unverified in its SPEC: it
 * counts nothing on the coverage map until a run against the harness has
 * passed. The editor's controls it drives are named by their words, which
 * the unit suites pin.
 *
 * ## CHROMIUM ONLY, and that is a limitation rather than a choice
 *
 * A green run here is a regression net and never a substitute for the manual
 * Safari pass before dev goes to main.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTarget, hasAdminCredentials, loadSecrets } from "../../scripts/e2e/lib/env.mjs";
import {
  approvePendingApplicant,
  createStepRecorder,
  newIdentityPage,
  openBrowser,
  signInWithPassword,
  stubRecaptchaOnLoopback,
  waitForRecaptchaWidget,
} from "../../scripts/e2e/lib/browser.mjs";
import { ARTIFACTS_DIR, RECAPTCHA_SKIP_REASON, markerPath, readState, stateDir, statePath } from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/events-authoring.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);
const WAIT_MS = 45_000;

/** The words the event's page says to somebody it is not for (src/lib/events/reach.ts). */
const ONLY_INVITED = "This event is only for the people invited to it.";

let skipReasonFor = () => null;

/**
 * Waits for the calm page an event for chosen people shows somebody it is not
 * for. A page that shows anything else fails with what it did show, since the
 * step's own snapshot is of the admin's page, not this one.
 */
async function waitForOnlyInvited(page) {
  await page
    .getByRole("heading", { name: ONLY_INVITED })
    .waitFor({ timeout: WAIT_MS })
    .catch(async (err) => {
      const said = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 1500);
      throw new Error(`${err.message}\nThe page at ${page.url()} said: ${said}`);
    });
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

const state = readState(SPEC.name, RUN_STATE_DIR);
const playwright = await loadPlaywright();
const skipReason = !playwright
  ? "Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium"
  : !state
    ? `No events-authoring fixture at ${STATE_PATH}. Run: npm run e2e:browser -- --spec events-authoring.`
    : !hasAdminCredentials()
      ? "This spec signs in as an admin. Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD: see scripts/e2e/README.md."
      : null;

function baseUrl() {
  return assertTarget(process.env.E2E_TARGET ?? "https://dev.naisi.uk");
}

test(
  "events authoring: an event for chosen people, from nothing to the invitee's request",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const admin = loadSecrets();
    const { browser, context, page } = await openBrowser();
    page.setDefaultNavigationTimeout(WAIT_MS);
    const recorder = createStepRecorder({
      t,
      page,
      markerPath: MARKER,
      artifactsDir: ARTIFACTS_DIR,
      skipReasonFor: (name) => skipReasonFor(name),
    });
    const step = (name, fn) => recorder.step(name, fn);
    // Every confirm the editor asks is answered yes, and its words kept for the step that reads them.
    const confirms = [];
    page.on("dialog", async (dialog) => {
      confirms.push(dialog.message());
      await dialog.accept();
    });

    /** The event's editor address, learned from the browser: only it knows the id. */
    let editorUrl = "";
    let eventId = "";
    const others = [];

    try {
      await step("the admin approves the two people this journey signs in as", async () => {
        await signInWithPassword(page, origin, { email: admin.adminEmail, password: admin.adminPassword }, { timeout: WAIT_MS });
        await approvePendingApplicant(page, origin, { email: state.invitee.email });
        await approvePendingApplicant(page, origin, { email: state.stranger.email });
      });

      await step("the admin makes an event for the invitee alone, and the editor counts it on one Home", async () => {
        await page.goto(`${origin}/events/manage/new`, { waitUntil: "domcontentloaded" });
        await page.locator("#new-title").fill(state.eventTitle);
        await page.getByRole("button", { name: "Create event" }).click();
        // The new event's own editor, not the page the press was made on:
        // `/events/manage/new` matches the shape too, and is where we start.
        await page.waitForURL((url) => /^\/events\/manage\/[^/]+$/.test(url.pathname) && url.pathname !== "/events/manage/new", {
          timeout: WAIT_MS,
        });
        editorUrl = page.url();
        eventId = new URL(editorUrl).pathname.split("/").pop();
        assert.ok(eventId && eventId !== "new", `the editor's address carries no event id: ${editorUrl}`);

        // Basics: a day next month at the popover's own time, and a place.
        await page.getByRole("button", { name: /Pick a start date and time/ }).click();
        const picker = page.getByRole("dialog", { name: "Pick date and time" });
        await picker.getByRole("button", { name: "Next month" }).click();
        await picker.getByRole("button", { name: "15", exact: true }).first().click();
        await picker.getByRole("button", { name: "Done" }).click();
        await page.locator("#location").fill("Cobden Room");

        // Details: one heading is a description.
        await page.getByRole("button", { name: /Details/ }).first().click();
        await page.getByRole("button", { name: "+ Add block" }).click();
        await page.getByRole("button", { name: /Heading/ }).first().click();
        await page.getByPlaceholder("e.g. What's new this month").fill("A dinner for the people chosen");

        // Who's it for: only the invitee, by name.
        await page.getByRole("button", { name: /Who’s it for/ }).first().click();
        await page.getByRole("radio", { name: /Only people you choose/ }).check();
        const box = page.getByLabel("Add a tag or a name");
        await box.waitFor({ timeout: WAIT_MS });
        await box.fill(state.invitee.name.split(" ")[0]);
        await page.getByRole("button", { name: new RegExp(`^Add ${state.invitee.name.split(" ")[0]}`) }).first().click();
        await page.getByText("1 person", { exact: false }).first().waitFor({ timeout: WAIT_MS });
        // The step's own count: one Home, and an invitation by their settings, which are off.
        await page.getByText("Publishing shows it on 1 person’s Home", { exact: false }).waitFor({ timeout: WAIT_MS });
        await page.getByRole("button", { name: "Save", exact: true }).click();
        // "Unsaved changes" goes once the write lands. (Not a wait for "Saved":
        // a text match ignores case, and "Unsaved" contains it.)
        await page.getByText("Unsaved changes").waitFor({ state: "hidden", timeout: WAIT_MS });
      });

      await step("the admin sends it for approval, approves it and publishes it, and the confirm says it is not listed or announced", async () => {
        // The step rail's buttons carry "Step 5: ..." before their label, so the
        // footer's are the exact names.
        await page.getByRole("button", { name: /Send for approval/ }).first().click();
        await page.getByRole("button", { name: "Send for approval", exact: true }).click();
        const approve = page.getByRole("button", { name: "Approve", exact: true });
        await approve.waitFor({ timeout: WAIT_MS });
        await approve.click();
        const publish = page.getByRole("button", { name: "Publish", exact: true });
        await publish.waitFor({ timeout: WAIT_MS });
        await publish.click();
        await page.getByText("Published. It shows on 1 person’s Home", { exact: false }).waitFor({ timeout: WAIT_MS });
        const asked = confirms.at(-1) ?? "";
        assert.match(asked, /Publishing shows it on 1 person’s Home/);
        assert.match(asked, /It won’t be listed on the events page or announced\./);
      });

      await step("a signed-out visitor is told it is only for the people invited, and the page's title names nothing", async () => {
        const visitor = await newIdentityPage(browser);
        others.push(visitor);
        await visitor.page.goto(`${origin}/events/${eventId}`, { waitUntil: "domcontentloaded" });
        await waitForOnlyInvited(visitor.page);
        assert.equal(await visitor.page.getByText(state.eventTitle).count(), 0, "the page names the event to a stranger");
        assert.doesNotMatch(await visitor.page.title(), new RegExp(state.eventTitle));
      });

      await step("the events page does not list it", async () => {
        const visitor = others[0];
        await visitor.page.goto(`${origin}/events`, { waitUntil: "domcontentloaded" });
        await visitor.page.locator("main").first().waitFor({ timeout: WAIT_MS });
        assert.equal(await visitor.page.getByText(state.eventTitle).count(), 0, "the events page lists an event for chosen people");
      });

      await step("the invitee finds it on Home, for them, and asks for a place", async () => {
        const invitee = await newIdentityPage(browser);
        others.push(invitee);
        const stubbed = await stubRecaptchaOnLoopback(invitee.page, origin);
        if (!stubbed) skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? RECAPTCHA_SKIP_REASON : null);
        await signInWithPassword(invitee.page, origin, { email: state.invitee.email, password: state.invitee.password }, { timeout: WAIT_MS });
        await invitee.page.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
        const card = invitee.page.locator("section").filter({ hasText: state.eventTitle }).filter({ hasText: "For you" }).first();
        await card.waitFor({ timeout: WAIT_MS });
        await card.getByRole("link", { name: "Ask for a place" }).click();
        await invitee.page.getByRole("heading", { name: state.eventTitle }).waitFor({ timeout: WAIT_MS });
        // The sign-up is reCAPTCHA-gated: a person takes seconds to press, a
        // spec milliseconds, so the press waits for the widget, as every gated
        // press in this harness does.
        await waitForRecaptchaWidget(invitee.page);
        await invitee.page.getByTestId("rsvp-submit").click();
        await invitee.page
          .getByTestId("rsvp-submitted")
          .waitFor({ timeout: WAIT_MS })
          .catch(async (err) => {
            const said = (await invitee.page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 1500);
            throw new Error(`${err.message}\nThe page at ${invitee.page.url()} said: ${said}`);
          });
      });

      await step("a member who was not invited is told it is only for the people invited", async () => {
        const stranger = await newIdentityPage(browser);
        others.push(stranger);
        await signInWithPassword(stranger.page, origin, { email: state.stranger.email, password: state.stranger.password }, { timeout: WAIT_MS });
        await stranger.page.goto(`${origin}/events/${eventId}`, { waitUntil: "domcontentloaded" });
        await waitForOnlyInvited(stranger.page);
        assert.equal(await stranger.page.getByText(state.eventTitle).count(), 0);
      });
    } finally {
      for (const other of others) await other.context.close();
      await context.close();
      await browser.close();
      recorder.writeMarker();
    }
  },
);
