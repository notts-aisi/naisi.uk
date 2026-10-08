import MemberPage from "@/features/admin/MemberPage";

export const dynamic = "force-dynamic";

/**
 * One person's page: who they are, what they can do on the site, the record
 * the committee keeps of their applications, and the two careful actions.
 *
 * A Server Component that only resolves the uid. Everything below it is a
 * client component, because it reads the roster and the application record
 * client-direct under admin-only rules. `requireAdminPage()` in the
 * `(admin-only)` group's layout is the gate; nothing here repeats it.
 *
 * It never calls `notFound()`: an id that is on no account is answered on the
 * page, in a sentence, by the component that looked for it.
 *
 * `params` is a Promise in this version of Next and has to be awaited.
 */
export default async function MemberAdminPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;
  return <MemberPage uid={uid} />;
}
