"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { ConfirmDialog } from "@/components/states/confirm-dialog";
import { Badge } from "@/components/ui/badge";
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
import {
  ACTION_LABELS,
  ACTION_PERMISSIONS,
  PAGE_KEYS,
  PAGE_LABELS,
  RESOURCE_LABELS,
  ROLE_PRESETS,
  type ActionPermissionKeyAll,
  type ActionResource,
  type PageKey,
} from "@/lib/authorization/registry";
import { formatDate } from "@/lib/format";

import { createInvitation, revokeInvitation } from "./actions";
import { initialInvitationFormState, MAX_INVITATION_EMAIL_LENGTH } from "./invitation-form-state";
import type { PendingInvitation } from "./invitations";

/**
 * Permission checkboxes pre-fill from the selected role's preset
 * (lib/authorization/registry.ts's ROLE_PRESETS) and are fully editable
 * before sending -- the invitation always stores the exact final set
 * chosen, not a reference to "the preset" (same "presets are a UX
 * convenience, not a stored mode" design as the permission editor,
 * features/members/permission-editor.tsx). Rendered as native-submitting
 * Radix checkboxes (name + value), read server-side via
 * formData.getAll("pagePermissions"/"actionPermissions") in
 * features/members/actions.ts's createInvitation.
 */
function InvitationPermissionPicker({ role }: { role: "admin" | "member" }) {
  const [pages, setPages] = useState<Set<PageKey>>(() => new Set(ROLE_PRESETS[role].pages));
  const [actions, setActions] = useState<Set<ActionPermissionKeyAll>>(
    () => new Set(ROLE_PRESETS[role].actions),
  );
  const [presetRole, setPresetRole] = useState(role);

  // Re-seed from the new role's preset only when the role actually changes
  // (not on every render) -- still fully overridable afterward.
  if (role !== presetRole) {
    setPresetRole(role);
    setPages(new Set(ROLE_PRESETS[role].pages));
    setActions(new Set(ROLE_PRESETS[role].actions));
  }

  const resources = Object.keys(ACTION_PERMISSIONS) as ActionResource[];

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-foreground">Page &amp; action permissions</Label>
      <Tabs defaultValue="pages">
        <TabsList>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>
        <TabsContent value="pages" className="pt-1">
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
        <TabsContent value="actions" className="pt-1">
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

function InviteMemberForm({ onSuccess }: { onSuccess: () => void }) {
  const [state, formAction, isPending] = useActionState(createInvitation, initialInvitationFormState);
  const [role, setRole] = useState<"admin" | "member">("member");

  if (state.status === "success" && state.inviteUrl) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground">
          Invitation created. There&apos;s no email delivery configured yet -- copy this link and share it
          with them directly. It won&apos;t be shown again.
        </p>
        <div className="flex items-center gap-2">
          <Input readOnly value={state.inviteUrl} onFocus={(event) => event.currentTarget.select()} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(state.inviteUrl!);
              toast.success("Link copied.");
            }}
          >
            Copy
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onSuccess}>
            Done
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <form action={formAction} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            maxLength={MAX_INVITATION_EMAIL_LENGTH}
            aria-invalid={Boolean(state.fieldErrors?.email)}
          />
          {state.fieldErrors?.email ? (
            <p className="text-xs text-destructive">{state.fieldErrors.email}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <NativeSelect
            id="invite-role"
            name="role"
            required
            value={role}
            onChange={(event) => setRole(event.target.value as "admin" | "member")}
            aria-invalid={Boolean(state.fieldErrors?.role)}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            {role === "admin"
              ? "Manage organization operations, but cannot control ownership."
              : "Contributor access."}
          </p>
          {state.fieldErrors?.role ? (
            <p className="text-xs text-destructive">{state.fieldErrors.role}</p>
          ) : null}
        </div>
        <InvitationPermissionPicker role={role} />
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating…" : "Create invitation"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function InviteMemberDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Invite member</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
        </DialogHeader>
        {open ? <InviteMemberForm onSuccess={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function InvitationRow({
  invitation,
  canRevoke,
}: {
  invitation: PendingInvitation;
  canRevoke: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{invitation.email}</span>
          <Badge variant={invitation.role === "member" ? "secondary" : "default"}>{invitation.role}</Badge>
          {invitation.isExpired ? <Badge variant="destructive">Expired</Badge> : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {invitation.isExpired ? "Expired" : "Expires"} {formatDate(invitation.expiresAt)}
        </p>
      </div>
      {canRevoke ? (
        <>
          <Button variant="ghost" size="sm" disabled={isPending} onClick={() => setConfirmOpen(true)}>
            Revoke
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={`Revoke invitation for ${invitation.email}?`}
            description="They will no longer be able to use this invitation link to join."
            confirmLabel="Revoke"
            destructive
            onConfirm={() =>
              startTransition(async () => {
                const result = await revokeInvitation(invitation.id);
                if (!result.ok) toast.error(result.message ?? "Something went wrong.");
              })
            }
          />
        </>
      ) : null}
    </div>
  );
}

export function InvitationManagement({
  invitations,
  canInvite,
  canRevoke,
}: {
  invitations: PendingInvitation[];
  canInvite: boolean;
  canRevoke: boolean;
}) {
  const [search, setSearch] = useState("");

  // Purely client-side, over data already fetched through the tenant-scoped
  // RLS-safe query above -- same pattern as MemberManagement's own search,
  // no new query path here for it to bypass tenant isolation through.
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return invitations;
    return invitations.filter((invitation) => invitation.email.toLowerCase().includes(query));
  }, [invitations, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Pending invitations</h2>
        {canInvite ? <InviteMemberDialog /> : null}
      </div>
      {invitations.length > 1 ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="invitation-search" className="text-xs text-muted-foreground">
            Search
          </Label>
          <Input
            id="invitation-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by email…"
          />
        </div>
      ) : null}
      {invitations.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
          No pending invitations.
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
          No invitations match your search.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((invitation) => (
            <InvitationRow key={invitation.id} invitation={invitation} canRevoke={canRevoke} />
          ))}
        </div>
      )}
    </div>
  );
}
