"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolvePortalEntry } from "@/features/customers/resolve-portal-entry";
import { initialPortalEntryFormState } from "@/features/customers/portal-entry-form-state";

export function PortalEntryForm() {
  const [state, formAction, isPending] = useActionState(resolvePortalEntry, initialPortalEntryFormState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <div className="space-y-1.5">
        <Label htmlFor="portal-input">Portal link or code</Label>
        <Input
          id="portal-input"
          name="portalInput"
          placeholder="acme, or https://app.signalboard.com/feedback/acme"
          autoComplete="off"
          required
          aria-invalid={state.status === "error"}
        />
        <p className="text-xs text-muted-foreground">
          Paste the full link your organization shared, or just its code (the part after{" "}
          <span className="font-mono">/feedback/</span>).
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Opening portal…" : "Open Portal"}
        <ArrowRight
          className="size-4 transition-transform duration-200 group-hover/button:translate-x-0.5"
          data-icon="inline-end"
        />
      </Button>
    </form>
  );
}
