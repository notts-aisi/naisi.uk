import { NextResponse } from "next/server";
import { render } from "@react-email/render";
import ApplicationEmail from "@/emails/ApplicationEmail";
import { composeFacilitatingEmail, facilitatingFactsFromSample } from "@/lib/courses/facilitatingEmail";
import { composeIncubatorStartEmail, incubatorStartFactsFromSample } from "@/lib/courses/incubatorStartEmail";
import { composePlacementEmail, placementFactsFromSample } from "@/lib/courses/placementEmail";
import { getCurrentUser } from "@/lib/firebase/session";
import { isCourseTemplateId, type CourseTemplateId } from "@/lib/firestore/courseEmails";
import {
  personaliseBlocks,
  personaliseString,
  sanitizeBlocks,
  type TokenValues,
} from "@/lib/firestore/newsletterBlocks";

/** The one template whose preview is written by the placement email's own composer. */
const PLACEMENT_TEMPLATE_ID: CourseTemplateId = "course-allocated";

/** And the one written by the facilitators' email's composer. */
const FACILITATING_TEMPLATE_ID: CourseTemplateId = "course-facilitating";

/** And the one an incubator's people are sent at Publish, written by its own composer. */
const INCUBATOR_TEMPLATE_ID: CourseTemplateId = "course-allocated-incubator";

/**
 * Server-side render of a COURSE email for the admin editor's iframe preview.
 *
 * The course lifecycle templates render exactly as the application-email
 * preview does: same `ApplicationEmail` chrome, same `personaliseBlocks`, same
 * "an unresolved token stays literal so an admin notices" convention. Three are
 * the exception, each written by its own composer so the preview is the email
 * a person gets: the placement email, the facilitators' email and an
 * incubator's. (The weekly reminder this route was first written for is gone:
 * the week's emails are fixed words, `src/lib/courses/weekEmails/words.ts`.)
 *
 * Admin-only (it renders unsaved copy). Mirrors
 * `/api/admin/application-emails/preview`.
 */
export async function POST(req: Request) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: {
    subject?: string;
    blocks?: unknown;
    tokens?: unknown;
    templateId?: unknown;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawSubject = (payload.subject ?? "").toString();
  const blocks = sanitizeBlocks(payload.blocks);
  const tokens = sanitizeTokens(payload.tokens);
  const templateId =
    typeof payload.templateId === "string" && isCourseTemplateId(payload.templateId)
      ? payload.templateId
      : null;

  try {
    const html =
      templateId === PLACEMENT_TEMPLATE_ID
        ? await renderPlacementPreview(rawSubject, blocks, tokens)
        : templateId === FACILITATING_TEMPLATE_ID
          ? await renderFacilitatingPreview(rawSubject, blocks, tokens)
          : templateId === INCUBATOR_TEMPLATE_ID
            ? await renderIncubatorPreview(rawSubject, blocks, tokens)
            : await renderCourseTemplatePreview(rawSubject, blocks, tokens);
    return new NextResponse(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("[course-email preview]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Render failed" },
      { status: 500 },
    );
  }
}

/** The lifecycle templates with no composer of their own: the application-email path. */
function renderCourseTemplatePreview(
  rawSubject: string,
  blocks: ReturnType<typeof sanitizeBlocks>,
  tokens: TokenValues,
): Promise<string> {
  const subject = personaliseString(rawSubject, tokens) || "(no subject)";
  return render(
    ApplicationEmail({
      subject,
      blocks: personaliseBlocks(blocks, tokens),
      preheader: subject,
    }),
  );
}

/**
 * The placement email, through the composer a placed person's email is
 * written by, as a PROOF: a paragraph with nothing to say is left out exactly
 * as it would be for them, and a token that email cannot fill stays as typed
 * for the admin to notice. A send refuses that token instead.
 */
function renderPlacementPreview(
  rawSubject: string,
  blocks: ReturnType<typeof sanitizeBlocks>,
  tokens: TokenValues,
): Promise<string> {
  const proof = composePlacementEmail({ subject: rawSubject, blocks }, placementFactsFromSample(tokens), {
    proof: true,
  });
  const subject = (proof.ok && proof.subject) || "(no subject)";
  return render(
    ApplicationEmail({
      subject,
      blocks: proof.ok ? proof.blocks : [],
      preheader: subject,
    }),
  );
}

/**
 * The facilitators' email, through its own composer, as a PROOF: exactly as
 * for the placement email above, a paragraph with nothing to say is left out
 * as it would be for a facilitator, and a token it cannot fill stays as typed.
 */
function renderFacilitatingPreview(
  rawSubject: string,
  blocks: ReturnType<typeof sanitizeBlocks>,
  tokens: TokenValues,
): Promise<string> {
  const proof = composeFacilitatingEmail({ subject: rawSubject, blocks }, facilitatingFactsFromSample(tokens), {
    proof: true,
  });
  const subject = (proof.ok && proof.subject) || "(no subject)";
  return render(
    ApplicationEmail({
      subject,
      blocks: proof.ok ? proof.blocks : [],
      preheader: subject,
    }),
  );
}

/**
 * The incubator's email, through its own composer, as a PROOF: exactly as for
 * the two above, a paragraph with nothing to say is left out as it would be
 * for a person on the run, and a token it cannot fill stays as typed.
 */
function renderIncubatorPreview(
  rawSubject: string,
  blocks: ReturnType<typeof sanitizeBlocks>,
  tokens: TokenValues,
): Promise<string> {
  const proof = composeIncubatorStartEmail({ subject: rawSubject, blocks }, incubatorStartFactsFromSample(tokens), {
    proof: true,
  });
  const subject = (proof.ok && proof.subject) || "(no subject)";
  return render(
    ApplicationEmail({
      subject,
      blocks: proof.ok ? proof.blocks : [],
      preheader: subject,
    }),
  );
}

function sanitizeTokens(raw: unknown): TokenValues {
  if (!raw || typeof raw !== "object") return {};
  const out: TokenValues = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
