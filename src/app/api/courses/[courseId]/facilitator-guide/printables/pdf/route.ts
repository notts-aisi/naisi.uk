import { NextResponse } from "next/server";
import { facilitatorGuideReader } from "@/lib/courses/facilitatorGuide/access";
import { facilitatorGuidePath } from "@/lib/courses/facilitatorGuide/model";
import {
  parseSessionParam,
  printablesFileName,
  printablesOfSession,
  printablesPdfTitle,
  sectionsOfSession,
} from "@/lib/courses/facilitatorGuide/printables";
import { renderPrintablesPdf } from "@/lib/courses/facilitatorGuide/printablesPdf";
import { readSessionCount } from "@/lib/courses/facilitatorGuide/sessionCount";
import { readGuideIndex, readGuidePage } from "@/lib/courses/facilitatorGuide/store";
import {
  ASK_FOR_A_SESSION,
  GUIDE_REFUSED,
  PRINTABLES_NOT_LOADED,
  noSuchSessionWords,
  nothingForSessionWords,
} from "@/lib/courses/facilitatorGuide/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * A COURSE'S PRINTABLES AS ONE A4 PDF, ready to send to a printer: one
 * session's (`?session=3`), or the whole document's (no `session`). Opened
 * by the links on the printables page and on each week's page of the
 * facilitator guide.
 *
 * WHO: the guide's readers and nobody else, through its one gate
 * (`facilitatorGuideReader`): a facilitator of a live group on a run of the
 * course, the lead of a programme naming a run of it, and admins. Everybody
 * it refuses, and everybody asking about a course that is not there, is given
 * the guide's one calm sentence at 200 and not a byte of a PDF, so nobody
 * learns which courses exist. Somebody signed out is sent to sign in, and
 * back to the printables page after.
 *
 * WHAT: the stored Printables document, split by its own "##" headings
 * (`printables.ts`), drawn on request (`printablesPdf.ts`) and never stored.
 * A session is a whole number from 1 to as many weeks as the guide has.
 *
 * Reads and draws; writes nothing, so a view-as session gets what the member
 * would. The file is named for the course and the session, saved rather than
 * shown, and kept out of every cache but the reader's and out of search
 * results. Every other answer is a sentence for the person who opened the
 * link, as text, because a link opened in a browser shows it as it is.
 */

type Ctx = { params: Promise<{ courseId: string }> };

const PRINTABLES = { kind: "course", key: "printables" } as const;

/** A sentence for whoever opened the link, never cached. */
function sentence(text: string, status: number): Response {
  return new Response(text, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function GET(req: Request, ctx: Ctx) {
  const { courseId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) {
    // Relative, as the site's other hand-built redirects are: behind the
    // hosting proxy the request's own address names an internal host.
    const back = facilitatorGuidePath(courseId, PRINTABLES);
    return new Response(null, {
      status: 307,
      headers: { Location: `/login?next=${encodeURIComponent(back)}`, "Cache-Control": "private, no-store" },
    });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const reader = await facilitatorGuideReader(db, user, courseId);
  if (!reader) return sentence(GUIDE_REFUSED, 200);

  const asked = parseSessionParam(new URL(req.url).searchParams.get("session"));
  if (asked === "bad") return sentence(ASK_FOR_A_SESSION, 400);

  const [loaded] = await readGuidePage(db, reader, PRINTABLES);
  if (!loaded) return sentence(PRINTABLES_NOT_LOADED, 404);

  if (asked !== null) {
    const index = await readGuideIndex(db, reader);
    const sessions = await readSessionCount(
      db,
      reader,
      index.weeks.map((week) => week.weekNumber),
    );
    if (asked > sessions) return sentence(noSuchSessionWords(asked, sessions), 404);
    if (sectionsOfSession(loaded.doc, asked).length === 0) return sentence(nothingForSessionWords(asked), 404);
  }

  const doc = asked === null ? loaded.doc : printablesOfSession(loaded.doc, asked);
  const { bytes } = await renderPrintablesPdf(doc, printablesPdfTitle(reader.courseTitle, asked));
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${printablesFileName(reader.courseTitle, asked)}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
