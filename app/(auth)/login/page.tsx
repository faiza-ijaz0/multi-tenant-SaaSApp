import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { sanitizeNextPath } from "@/lib/auth/auth-form-state";
import { getCurrentUser } from "@/lib/auth/context";

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = sanitizeNextPath(typeof params.next === "string" ? params.next : undefined);

  const isAuthenticated = await getCurrentUser()
    .then(() => true)
    .catch(() => false);
  if (isAuthenticated) {
    redirect(next);
  }

  return <LoginForm next={next} linkError={params.error === "invalid_link"} />;
}
