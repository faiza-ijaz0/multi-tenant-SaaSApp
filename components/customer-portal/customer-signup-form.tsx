"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { customerSignup } from "@/lib/auth/customer-auth-actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/auth-form-state";
import { MAX_FULL_NAME_LENGTH, initialCustomerAuthFormState } from "@/lib/auth/customer-auth-form-state";

const cardClassName =
  "border-border/60 shadow-[0_24px_60px_-24px_hsl(var(--shadow-color)/0.35)] ring-1 ring-foreground/5";

export function CustomerSignupForm() {
  const [state, formAction, isPending] = useActionState(customerSignup, initialCustomerAuthFormState);

  if (state.status === "success") {
    return (
      <Card className={cardClassName}>
        <CardHeader>
          <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-success/20 to-success/5 text-success ring-1 ring-success/15">
            <Sparkles className="size-5" aria-hidden="true" />
          </span>
          <CardTitle className="mt-3 text-lg">Check your email</CardTitle>
          <CardDescription>{state.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/feedback/sign-in" className="text-sm font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cardClassName}>
      <CardHeader>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-2.5 py-0.5 text-xs font-medium text-primary">
          Customer Account
        </span>
        <CardTitle className="mt-2 text-xl">Create your account</CardTitle>
        <CardDescription>Sign up to submit and track feedback with your favorite products.</CardDescription>
      </CardHeader>
      <CardContent>
        <FormError message={state.status === "error" ? state.message : undefined} />
        <form action={formAction} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="customer-fullName">Full name</Label>
            <Input
              id="customer-fullName"
              name="fullName"
              autoComplete="name"
              required
              maxLength={MAX_FULL_NAME_LENGTH}
              aria-invalid={Boolean(state.fieldErrors?.fullName)}
            />
            {state.fieldErrors?.fullName ? (
              <p className="text-xs text-destructive">{state.fieldErrors.fullName}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-email">Email</Label>
            <Input
              id="customer-email"
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
            <Label htmlFor="customer-password">Password</Label>
            <Input
              id="customer-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              aria-invalid={Boolean(state.fieldErrors?.password)}
            />
            {state.fieldErrors?.password ? (
              <p className="text-xs text-destructive">{state.fieldErrors.password}</p>
            ) : (
              <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-confirmPassword">Confirm password</Label>
            <Input
              id="customer-confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
            />
            {state.fieldErrors?.confirmPassword ? (
              <p className="text-xs text-destructive">{state.fieldErrors.confirmPassword}</p>
            ) : null}
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/feedback/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
