"use client";

import { type FormEvent, useState, useTransition } from "react";
import { Pencil } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { OrganizationRole } from "@/lib/auth/types";
import {
  ACTION_LABELS,
  ACTION_PERMISSIONS,
  ALL_ACTION_PERMISSION_KEYS,
  PAGE_KEYS,
  PAGE_LABELS,
  RESOURCE_LABELS,
  ROLE_PRESETS,
  type ActionPermissionKeyAll,
  type ActionResource,
  type PageKey,
} from "@/lib/authorization/registry";

import { updateMemberAccount, type UpdateMemberAccountResult } from "./update-account";
import type { OrganizationMemberWithContact } from "./queries";

const ALL_ROLES: OrganizationRole[] = ["owner", "admin", "member"];

const initialResult: UpdateMemberAccountResult = { ok: true };

/**
 * Only ever mounted while its dialog is open (`open ? <.../> : null` in
 * MemberEditDialog below), same remount-on-reopen convention as
 * PermissionEditorForm -- local state always starts fresh from the current
 * props.
 *
 * A single combined save (name/email/role/pages/actions), matching
 * update-account.ts's own doc comment: "one Edit action per row, not
 * separate Edit-role and Edit-permissions dialogs." updateMemberAccount's
 * signature is `(membershipId, formData)`, not `(prevState, formData)`, so
 * this follows the same "manual FormData + useTransition" convention this
 * feature already uses for removeMember/transferOwnership rather than
 * useActionState.
 */
function MemberEditForm({
  membershipId,
  member,
  actorRole,
  canManagePermissions,
  currentPages,
  currentActions,
  onClose,
}: {
  membershipId: string;
  member: OrganizationMemberWithContact;
  actorRole: OrganizationRole;
  canManagePermissions: boolean;
  currentPages: PageKey[];
  currentActions: ActionPermissionKeyAll[];
  onClose: () => void;
}) {
  const [role, setRole] = useState<OrganizationRole>(member.role);
  const [pages, setPages] = useState<Set<PageKey>>(() => new Set(currentPages));
  const [actions, setActions] = useState<Set<ActionPermissionKeyAll>>(() => new Set(currentActions));
  const [result, setResult] = useState<UpdateMemberAccountResult>(initialResult);
  const [isPending, startTransition] = useTransition();

  const isTargetOwner = role === "owner";
  const showPermissionTabs = canManagePermissions && !isTargetOwner;
  // Only an owner may grant or revoke the owner role -- mirrors the
  // server-side owner-only checks in updateMemberRoleForOrganization/
  // enforce_membership_role_invariants.
  const roleOptions = actorRole === "owner" ? ALL_ROLES : ALL_ROLES.filter((r) => r !== "owner");
  const resources = Object.keys(ACTION_PERMISSIONS) as ActionResource[];

  function togglePage(key: PageKey, checked: boolean) {
    setPages((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleAction(key: ActionPermissionKeyAll, checked: boolean) {
    setActions((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function resetToPreset() {
    if (role === "owner") return;
    const preset = ROLE_PRESETS[role];
    setPages(new Set(preset.pages));
    setActions(new Set(preset.actions));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("currentEmail", member.email ?? "");
    if (showPermissionTabs) {
      formData.delete("pagePermissions");
      formData.delete("actionPermissions");
      for (const page of pages) formData.append("pagePermissions", page);
      for (const action of actions) formData.append("actionPermissions", action);
    }

    startTransition(async () => {
      const next = await updateMemberAccount(membershipId, formData);
      setResult(next);
      if (next.ok) {
        toast.success("Member updated.");
        onClose();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
      <FormError message={!result.ok ? result.message : undefined} />

      <div className="space-y-1.5">
        <Label htmlFor="edit-member-name">Name</Label>
        <Input
          id="edit-member-name"
          name="name"
          required
          maxLength={120}
          defaultValue={member.fullName ?? ""}
          aria-invalid={Boolean(result.fieldErrors?.name)}
        />
        {result.fieldErrors?.name ? <p className="text-xs text-destructive">{result.fieldErrors.name}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-member-email">Email</Label>
        <Input
          id="edit-member-email"
          name="email"
          type="email"
          required
          defaultValue={member.email ?? ""}
          aria-invalid={Boolean(result.fieldErrors?.email)}
        />
        {result.fieldErrors?.email ? <p className="text-xs text-destructive">{result.fieldErrors.email}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-member-role">Role</Label>
        <NativeSelect
          id="edit-member-role"
          name="role"
          required
          value={role}
          onChange={(event) => setRole(event.target.value as OrganizationRole)}
          aria-invalid={Boolean(result.fieldErrors?.role)}
        >
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </NativeSelect>
        {result.fieldErrors?.role ? <p className="text-xs text-destructive">{result.fieldErrors.role}</p> : null}
      </div>

      {isTargetOwner ? (
        <p className="rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
          Owners have full access to every page and action and don&apos;t hold individual grants.
        </p>
      ) : !canManagePermissions ? (
        <p className="rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
          You don&apos;t have permission to change this member&apos;s pages or actions.
        </p>
      ) : (
        <Tabs defaultValue="pages">
          <TabsList>
            <TabsTrigger value="pages">Pages</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="pages" className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Dashboard pages this member can open.</p>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="xs" onClick={() => setPages(new Set(PAGE_KEYS))}>
                  Select all
                </Button>
                <Button type="button" variant="ghost" size="xs" onClick={() => setPages(new Set())}>
                  Clear all
                </Button>
              </div>
            </div>
            <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-border p-2">
              {PAGE_KEYS.map((key) => (
                <Label key={key} htmlFor={`edit-page-${key}`} className="rounded-md px-2 py-1.5 font-normal hover:bg-muted/40">
                  <Checkbox
                    id={`edit-page-${key}`}
                    checked={pages.has(key)}
                    onCheckedChange={(checked) => togglePage(key, checked === true)}
                  />
                  {PAGE_LABELS[key]}
                </Label>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="actions" className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Specific actions this member can perform.</p>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setActions(new Set(ALL_ACTION_PERMISSION_KEYS))}
                >
                  Select all
                </Button>
                <Button type="button" variant="ghost" size="xs" onClick={() => setActions(new Set())}>
                  Clear all
                </Button>
              </div>
            </div>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border p-2">
              {resources.map((resource) => (
                <div key={resource} className="space-y-1.5 rounded-lg bg-muted/40 p-2.5">
                  <h4 className="text-xs font-semibold text-foreground">{RESOURCE_LABELS[resource]}</h4>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {ACTION_PERMISSIONS[resource].map((action) => {
                      const key = `${resource}:${action}` as ActionPermissionKeyAll;
                      return (
                        <Label key={key} className="font-normal">
                          <Checkbox
                            checked={actions.has(key)}
                            onCheckedChange={(checked) => toggleAction(key, checked === true)}
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
      )}

      {showPermissionTabs ? (
        <div className="flex items-center justify-between border-t border-border pt-3">
          <Button type="button" variant="outline" size="sm" onClick={resetToPreset}>
            Reset to {role} preset
          </Button>
        </div>
      ) : null}
      </div>

      <DialogFooter className="mx-0 mb-0 shrink-0 rounded-b-xl border-t border-border/70 bg-muted/40 px-5 py-4">
        <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save Changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function MemberEditDialog({
  membershipId,
  member,
  memberLabel,
  actorRole,
  canManagePermissions,
  currentPages,
  currentActions,
}: {
  membershipId: string;
  member: OrganizationMemberWithContact;
  memberLabel: string;
  actorRole: OrganizationRole;
  canManagePermissions: boolean;
  currentPages: PageKey[];
  currentActions: ActionPermissionKeyAll[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${memberLabel}`}>
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Edit</TooltipContent>
      </Tooltip>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 gap-1 border-b border-border/70 px-5 py-4 pr-10">
          <DialogTitle>Edit {memberLabel}</DialogTitle>
        </DialogHeader>
        {open ? (
          <MemberEditForm
            membershipId={membershipId}
            member={member}
            actorRole={actorRole}
            canManagePermissions={canManagePermissions}
            currentPages={currentPages}
            currentActions={currentActions}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
