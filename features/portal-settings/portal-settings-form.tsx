"use client";

import { useActionState, useState, type ReactNode } from "react";
import { CheckCircle2, Globe, Palette } from "lucide-react";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { updatePortalSettings } from "./actions";
import {
  DEFAULT_ACCENT_COLOR,
  initialPortalSettingsFormState,
  MAX_BRAND_NAME_LENGTH,
  MAX_WELCOME_MESSAGE_LENGTH,
} from "./form-state";
import type { PortalSettings } from "./queries";

/** A labeled group within the portal settings form -- gives the page a
 * "configuration console" structure (Address / Branding / Visibility)
 * instead of one long undifferentiated field stack. */
function FormSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/10"
        >
          {icon}
        </span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function AccentColorField({ defaultValue }: { defaultValue: string }) {
  const [color, setColor] = useState(defaultValue);
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-input bg-card p-1 pr-3">
      <input
        id="portal-accent-color"
        name="accentColor"
        type="color"
        defaultValue={defaultValue}
        onChange={(event) => setColor(event.target.value)}
        className="h-7 w-12 cursor-pointer rounded-md border-0 bg-transparent"
      />
      <span className="text-xs font-medium tabular-nums text-muted-foreground uppercase">{color}</span>
    </div>
  );
}

/**
 * Read-only view for a plain member -- requireAdminScope() in ./actions.ts
 * (backed by RLS) is the actual authorization boundary; this just avoids
 * rendering editable controls a member's submission would always be
 * rejected for, matching the pattern in CategoryManager/StatusManager.
 */
function ReadOnlyPortalSettings({ settings }: { settings: PortalSettings | null }) {
  if (!settings) {
    return (
      <p className="text-sm text-muted-foreground">
        No public portal has been configured yet. Ask an owner or admin to set one up.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Only owners and admins can edit portal settings.
      </p>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Slug</dt>
          <dd className="text-foreground">/feedback/{settings.slug}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Portal name</dt>
          <dd className="text-foreground">{settings.brandName || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Welcome message</dt>
          <dd className="text-foreground">{settings.welcomeMessage || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Visibility</dt>
          <dd className="text-foreground">
            {settings.isPublic ? "Public -- anyone with the link can view this portal" : "Private"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function PortalSettingsForm({
  settings,
  canManage,
}: {
  settings: PortalSettings | null;
  canManage: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updatePortalSettings,
    initialPortalSettingsFormState,
  );

  if (!canManage) {
    return <ReadOnlyPortalSettings settings={settings} />;
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.status === "success" ? (
        <p className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-sm font-medium text-success">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          {state.message}
        </p>
      ) : null}
      <FormError message={state.status === "error" ? state.message : undefined} />

      <FormSection
        icon={<Globe className="size-4" aria-hidden="true" />}
        title="Portal address"
        description="Where customers reach your public feedback portal."
      >
        <div className="space-y-1.5">
          <Label htmlFor="portal-slug">Slug</Label>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="shrink-0">/feedback/</span>
            <Input
              id="portal-slug"
              name="slug"
              required
              defaultValue={settings?.slug ?? ""}
              aria-invalid={Boolean(state.fieldErrors?.slug)}
            />
          </div>
          {state.fieldErrors?.slug ? (
            <p className="text-xs text-destructive">{state.fieldErrors.slug}</p>
          ) : null}
        </div>

        <Label
          htmlFor="portal-is-public"
          className="rounded-lg border border-border/70 bg-card px-3 py-2.5 font-normal"
        >
          <Checkbox id="portal-is-public" name="isPublic" defaultChecked={settings?.isPublic ?? false} />
          Public -- anyone with the link can view this portal
        </Label>
      </FormSection>

      <FormSection
        icon={<Palette className="size-4" aria-hidden="true" />}
        title="Branding"
        description="How the portal introduces itself to customers."
      >
        <div className="space-y-1.5">
          <Label htmlFor="portal-brand-name">Portal name</Label>
          <Input
            id="portal-brand-name"
            name="brandName"
            maxLength={MAX_BRAND_NAME_LENGTH}
            defaultValue={settings?.brandName ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.brandName)}
          />
          {state.fieldErrors?.brandName ? (
            <p className="text-xs text-destructive">{state.fieldErrors.brandName}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="portal-welcome-message">Welcome message</Label>
          <Textarea
            id="portal-welcome-message"
            name="welcomeMessage"
            maxLength={MAX_WELCOME_MESSAGE_LENGTH}
            defaultValue={settings?.welcomeMessage ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.welcomeMessage)}
          />
          {state.fieldErrors?.welcomeMessage ? (
            <p className="text-xs text-destructive">{state.fieldErrors.welcomeMessage}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="portal-logo-url">Logo URL (optional)</Label>
          <Input
            id="portal-logo-url"
            name="logoUrl"
            type="url"
            defaultValue={settings?.logoUrl ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.logoUrl)}
          />
          {state.fieldErrors?.logoUrl ? (
            <p className="text-xs text-destructive">{state.fieldErrors.logoUrl}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="portal-accent-color">Accent color</Label>
          <AccentColorField defaultValue={settings?.accentColor ?? DEFAULT_ACCENT_COLOR} />
        </div>
      </FormSection>

      <Button type="submit" disabled={isPending} className={cn(isPending && "opacity-90")}>
        {isPending ? "Saving…" : "Save portal settings"}
      </Button>
    </form>
  );
}
