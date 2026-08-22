"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OrganizationRole } from "@/lib/auth/types";
import {
  ACTION_LABELS,
  ACTION_PERMISSIONS,
  PAGE_KEYS,
  PAGE_LABELS,
  RESOURCE_LABELS,
  type ActionPermissionKeyAll,
  type ActionResource,
  type PageKey,
} from "@/lib/authorization/registry";

import { createMemberAccount } from "./create-account";
import { initialCreateMemberAccountState } from "./create-account-form-state";

/**
 * Every page/action checkbox starts unchecked -- a brand-new account gets
 * exactly the grants the creator explicitly checks, never a role-based
 * preset (create_member_account, 0014, happily accepts empty p_pages/
 * p_actions arrays: the foreach loops simply run zero times, no implicit
 * grant is ever inserted). Selecting a role in the form above does not
 * re-seed this picker.
 */
function CreateMemberPermissionPicker() {
  const [pages, setPages] = useState<Set<PageKey>>(() => new Set());
  const [actions, setActions] = useState<Set<ActionPermissionKeyAll>>(() => new Set());

  const resources = Object.keys(ACTION_PERMISSIONS) as ActionResource[];

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-foreground">Page &amp; action permissions</Label>
      {/*
       * forceMount on both TabsContent panels below is load-bearing, not
       * decoration. This form submits via a native <form action={formAction}>
       * (useActionState) -- no onSubmit handler manually rebuilds FormData
       * from `pages`/`actions` state the way MemberEditForm's does. Radix's
       * TabsContent unmounts the inactive panel by default (Presence with
       * present=isSelected, see @radix-ui/react-tabs), which removes its
       * checkboxes' hidden bubble <input>s from the DOM entirely. Without
       * forceMount, whichever tab (Pages or Actions) isn't visible at the
       * moment "Create account" is clicked contributes ZERO values to the
       * submitted FormData -- even though the user checked boxes on it
       * earlier and `pages`/`actions` React state still holds the
       * selection -- producing a member with 0 grants for that category
       * despite every UI signal suggesting otherwise. data-[state=inactive]:hidden
       * keeps the inactive panel visually hidden (a plain CSS `hidden`
       * attribute, not removal from the DOM) -- form values of hidden
       * elements still participate in native form submission, only
       * `disabled` elements are excluded.
       */}
      <Tabs defaultValue="pages">
        <TabsList>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>
        <TabsContent value="pages" forceMount className="pt-1 data-[state=inactive]:hidden">
          <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-border p-2">
            {PAGE_KEYS.map((key) => (
              <Label key={key} className="rounded-md px-2 py-1.5 font-normal hover:bg-muted/40">
                <Checkbox
                  name="pagePermissions"
                  value={key}
                  checked={pages.has(key)}
                  onCheckedChange={(checked) =>
                    setPages((prev) => {
                      const next = new Set(prev);
                      if (checked === true) next.add(key);
                      else next.delete(key);
                      return next;
                    })
                  }
                />
                {PAGE_LABELS[key]}
              </Label>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="actions" forceMount className="pt-1 data-[state=inactive]:hidden">
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border p-2">
            {resources.map((resource) => (
              <div key={resource} className="space-y-1.5 rounded-lg bg-muted/40 p-2.5">
                <h4 className="text-xs font-semibold text-foreground">{RESOURCE_LABELS[resource]}</h4>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {ACTION_PERMISSIONS[resource].map((action) => {
                    const key = `${resource}:${action}` as ActionPermissionKeyAll;
                    return (
                      <Label key={key} className="font-normal">
                        <Checkbox
                          name="actionPermissions"
                          value={key}
                          checked={actions.has(key)}
                          onCheckedChange={(checked) =>
                            setActions((prev) => {
                              const next = new Set(prev);
                              if (checked === true) next.add(key);
                              else next.delete(key);
                              return next;
                            })
                          }
                        />
                        {ACTION_LABELS[action]}
                      </Label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Only ever mounted while its dialog is open (`open ? <.../> : null` below),
 * same remount-on-reopen convention as PermissionEditorForm.
 *
 * On success, shows ONLY a toast -- never the password, never an invite
 * link -- and closes the dialog; deliberately different from
 * InviteMemberForm's copy-a-link success state (see create-account.ts's own
 * doc comment on why this flow exists instead of an invite link).
 */
function CreateMemberForm({
  actorRole,
  onClose,
}: {
  actorRole: OrganizationRole;
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState(createMemberAccount, initialCreateMemberAccountState);
  const [role, setRole] = useState<OrganizationRole>("member");

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Account created successfully.");
      onClose();
    }
    // onClose is stable (defined inline as `() => setOpen(false)` by the
    // dialog, but only state.status transitioning to "success" should ever
    // trigger this -- re-running on an onClose identity change would be
    // harmless here anyway since the effect is idempotent per state object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <FormError message={state.status === "error" ? state.message : undefined} />
        <div className="space-y-1.5">
          <Label htmlFor="create-member-name">Name</Label>
          <Input
            id="create-member-name"
            name="name"
            required
            maxLength={120}
            aria-invalid={Boolean(state.fieldErrors?.name)}
          />
          {state.fieldErrors?.name ? <p className="text-xs text-destructive">{state.fieldErrors.name}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="create-member-email">Email</Label>
          <Input
            id="create-member-email"
            name="email"
            type="email"
            required
            aria-invalid={Boolean(state.fieldErrors?.email)}
          />
          {state.fieldErrors?.email ? <p className="text-xs text-destructive">{state.fieldErrors.email}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="create-member-password">Password</Label>
          <Input
            id="create-member-password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            aria-invalid={Boolean(state.fieldErrors?.password)}
          />
          <p className="text-xs text-muted-foreground">At least 8 characters. They can change it after signing in.</p>
          {state.fieldErrors?.password ? (
            <p className="text-xs text-destructive">{state.fieldErrors.password}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="create-member-role">Role</Label>
          <NativeSelect
            id="create-member-role"
            name="role"
            required
            value={role}
            onChange={(event) => setRole(event.target.value as OrganizationRole)}
            aria-invalid={Boolean(state.fieldErrors?.role)}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            {actorRole === "owner" ? <option value="owner">Owner</option> : null}
          </NativeSelect>
          {state.fieldErrors?.role ? <p className="text-xs text-destructive">{state.fieldErrors.role}</p> : null}
        </div>
        {role === "owner" ? (
          <p className="rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
            Owners have full access to every page and action -- there&apos;s nothing to select below.
          </p>
        ) : (
          <CreateMemberPermissionPicker />
        )}
      </div>
      <DialogFooter className="mx-0 mb-0 shrink-0 rounded-b-xl border-t border-border/70 bg-muted/40 px-5 py-4">
        <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create account"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CreateMemberDialog({ actorRole }: { actorRole: OrganizationRole }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="bg-gradient-to-r from-primary to-primary/75 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.12)] hover:from-primary/90 hover:to-primary/65"
        >
          + Add Member
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 gap-1 border-b border-border/70 px-5 py-4 pr-10">
          <DialogTitle>Add a member</DialogTitle>
        </DialogHeader>
        {open ? <CreateMemberForm actorRole={actorRole} onClose={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
