import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/context";

export default async function ResetPasswordPage() {
  // A valid recovery session (established by /auth/confirm from the emailed
  // link) is what getCurrentUser() actually verifies here -- there's no
  // separate "recovery token" to check, Supabase treats it as a normal
  // session once /auth/confirm exchanges it.
  const hasRecoverySession = await getCurrentUser()
    .then(() => true)
    .catch(() => false);

  if (!hasRecoverySession) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Link invalid or expired</CardTitle>
          <CardDescription>
            This password reset link is no longer valid. Request a new one to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-foreground hover:underline"
          >
            Request a new link
          </Link>
        </CardContent>
      </Card>
    );
  }

  return <ResetPasswordForm />;
}
