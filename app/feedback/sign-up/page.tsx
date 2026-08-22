import { redirect } from "next/navigation";

import { CustomerAuthShell } from "@/components/customer-portal/customer-auth-shell";
import { CustomerSignupForm } from "@/components/customer-portal/customer-signup-form";
import { getCurrentUser } from "@/lib/auth/context";

export default async function CustomerSignupPage() {
  const isAuthenticated = await getCurrentUser()
    .then(() => true)
    .catch(() => false);
  if (isAuthenticated) {
    redirect("/feedback/portal");
  }

  return (
    <CustomerAuthShell>
      <CustomerSignupForm />
    </CustomerAuthShell>
  );
}
