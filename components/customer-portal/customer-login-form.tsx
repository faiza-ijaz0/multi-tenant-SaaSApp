"use client";

import { useActionState } from "react";
import Link from "next/link";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { customerLogin } from "@/lib/auth/customer-auth-actions";
import { initialCustomerAuthFormState } from "@/lib/auth/customer-auth-form-state";

interface CustomerLoginFormProps {
  next: string;
  linkError?: boolean;
}

export function CustomerLoginForm({ next, linkError }: CustomerLoginFormProps) {
  const [state, formAction, isPending] = useActionState(customerLogin, initialCustomerAuthFormState);

  return (
    <Card className="border-border/60 shadow-[0_24px_60px_-24px_hsl(var(--shadow-color)/0.35)] ring-1 ring-foreground/5">
      <CardHeader>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-2.5 py-0.5 text-xs font-medium text-primary">
          Customer Account
        </span>
        <CardTitle className="mt-2 text-xl">Sign in</CardTitle>
        <CardDescription>Sign in to your feedback portal account.</CardDescription>
      </CardHeader>
      <CardContent>
        <FormError
          message={
            linkError
              ? "That link is invalid or has expired. Please try again."
              : state.status === "error"
                ? state.message
                : undefined
          }
        />
        <form action={formAction} className="space-y-4" noValidate>
          <input type="hidden" name="next" value={next} />
          <div className="space-y-1.5">
            <Label htmlFor="customer-login-email">Email</Label>
            <Input
              id="customer-login-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={Boolean(state.fieldErrors?.email)}
            />
            {state.fieldErrors?.email ? (
              <p className="text-xs text-destructive">{state.fieldErrors.email}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="customer-login-password">Password</Label>
              <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
                Forgot password?
              </Link>
            </div>
            <Input
              id="customer-login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={Boolean(state.fieldErrors?.password)}
            />
            {state.fieldErrors?.password ? (
              <p className="text-xs text-destructive">{state.fieldErrors.password}</p>
            ) : null}
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/feedback/sign-up" className="font-medium text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
