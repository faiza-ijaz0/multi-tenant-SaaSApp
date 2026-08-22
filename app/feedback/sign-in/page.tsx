import { redirect } from "next/navigation";

import { CustomerAuthShell } from "@/components/customer-portal/customer-auth-shell";
import { CustomerLoginForm } from "@/components/customer-portal/customer-login-form";
import { sanitizeCustomerNextPath } from "@/lib/auth/customer-auth-form-state";
import { getCurrentUser } from "@/lib/auth/context";

interface CustomerSignInPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CustomerSignInPage({ searchParams }: CustomerSignInPageProps) {
  const params = await searchParams;
  const next = sanitizeCustomerNextPath(typeof params.next === "string" ? params.next : undefined);

  const isAuthenticated = await getCurrentUser()
    .then(() => true)
    .catch(() => false);
  if (isAuthenticated) {
    redirect(next);
  }

  return (
    <CustomerAuthShell>
      <CustomerLoginForm next={next} linkError={params.error === "invalid_link"} />
    </CustomerAuthShell>
  );
}
