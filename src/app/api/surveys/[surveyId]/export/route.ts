import { NextResponse } from "next/server";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { toCSV } from "@/lib/csv";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { logExport } from "@/lib/firestore/dataExports";
import { exportFilename, surveyExportTable } from "@/lib/surveys/exportTable";
import { namesOf } from "@/lib/surveys/names";
import { answersOf, canRunSurveys, isSurveyId, readSurvey } from "@/lib/surveys/repo";
import { REFUSAL } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ surveyId: string }> };

/**
 * A SURVEY'S ANSWERS, WITH NAMES, AS A SPREADSHEET, for admins: one row per
 * person who answered, their name, when and how they sent it, whether their
 * group had met by then, and one column per question. Never an email address.
 *
 * A DOWNLOAD THE SITE LOGS (`dataExports`, kind `survey-answers`): the row is
 * written before the file is handed over, and when it cannot be written the
 * file is refused. A POST, so a link that is fetched by something other than
 * the admin's own press downloads nothing.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: REFUSAL.notSignedIn }, { status: 401 });
  if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });

  const { surveyId } = await ctx.params;
  if (!isSurveyId(surveyId)) return NextResponse.json({ error: REFUSAL.body }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const survey = await readSurvey(db, surveyId);
  if (!survey) return NextResponse.json({ error: REFUSAL.noSurvey }, { status: 404 });

  const answers = await answersOf(db, survey);
  const names = await namesOf(db, answers.flatMap((answer) => (answer.respondent ? [answer.respondent.uid] : [])));
  const table = surveyExportTable(
    survey.items,
    answers.map((answer) => ({
      name: answer.respondent ? (names.get(answer.respondent.uid) ?? null) : null,
      sentAt: answer.sentAt,
      via: answer.via,
      afterFirstSession: answer.afterFirstSession,
      answers: answer.answers,
    })),
  );
  const filename = exportFilename(survey.name, londonDateKey(new Date()));
  const csv = toCSV(table.header, table.rows);

  try {
    await logExport(db, {
      kind: "survey-answers",
      actorUid: actor.uid,
      actorName: actor.displayName ?? "",
      scope: { surveyId: survey.id, roundId: survey.audience.roundId },
      rowCount: table.rows.length,
      filename,
    });
  } catch (err) {
    console.error("[surveys export] could not record the download", surveyId, err);
    return NextResponse.json(
      { error: "The download could not be recorded, so it was not made. Try again in a minute." },
      { status: 503 },
    );
  }

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
