import { redirect } from "next/navigation";

import { SignupForm } from "@/components/auth/signup-form";
import { getCurrentUser } from "@/lib/auth/context";

export default async function SignupPage() {
  const isAuthenticated = await getCurrentUser()
    .then(() => true)
    .catch(() => false);
  if (isAuthenticated) {
    redirect("/dashboard");
  }

  return <SignupForm />;
}
