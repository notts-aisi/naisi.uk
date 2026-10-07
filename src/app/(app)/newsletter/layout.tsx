import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/firebase/session";
import { canApproveNewsletter, canDraftNewsletter } from "@/lib/firestore/users";
import NewsletterHead from "@/features/newsletter/NewsletterHead";

export default async function NewsletterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const allowed =
    canDraftNewsletter(user) || canApproveNewsletter(user);
  if (!allowed) redirect("/dashboard");

  return (
    <div>
      <NewsletterHead
        canDraft={canDraftNewsletter(user)}
        canApprove={canApproveNewsletter(user)}
        isAdmin={user.role === "admin"}
      />
      {children}
    </div>
  );
}
