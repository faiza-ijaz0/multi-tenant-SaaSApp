"use client";

import { useActionState } from "react";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrganization } from "@/lib/auth/organization-actions";
import {
  initialOrganizationFormState,
  MAX_ORGANIZATION_NAME_LENGTH,
} from "@/lib/auth/organization-form-state";

export function OnboardingForm() {
  const [state, formAction, isPending] = useActionState(
    createOrganization,
    initialOrganizationFormState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your organization</CardTitle>
        <CardDescription>
          You&apos;ll be the owner. You can invite your team afterward.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormError message={state.status === "error" ? state.message : undefined} />
        <form action={formAction} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="name">Organization name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              autoComplete="organization"
              required
              maxLength={MAX_ORGANIZATION_NAME_LENGTH}
              aria-invalid={Boolean(state.fieldErrors?.name)}
            />
            {state.fieldErrors?.name ? (
              <p className="text-xs text-destructive">{state.fieldErrors.name}</p>
            ) : null}
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Creating…" : "Create organization"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
