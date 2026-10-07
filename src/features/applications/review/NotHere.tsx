import Link from "next/link";
import parts from "./parts.module.css";

/**
 * What a review screen says to somebody it has nothing for.
 *
 * The same words whether the form, the programme or the application does not
 * exist or is simply not theirs to read, so the page never confirms that
 * something is there. Rendered as ordinary HTML with the page, not thrown as
 * a not-found, so it reads the same before any script has loaded.
 */
export default function NotHere({ what }: { what: "applications" | "application" }) {
  return (
    <div className={`${parts.scope} ${parts.notHere}`}>
      <h1 className={parts.notHereTitle}>We can’t find that</h1>
      <p className={parts.notHereBody}>
        {what === "applications"
          ? "There’s no list of applications here that you review."
          : "There’s no application here that you review."}{" "}
        If there should be, ask an admin to check who is named on the programme.{" "}
        <Link href="/admin/admissions">Back to admissions</Link>
      </p>
    </div>
  );
}
