"use client";

import { useState, useTransition } from "react";
import { UserMinus } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/states/confirm-dialog";
import { Button } from "@/components/ui/button";

import { removeMember } from "@/features/members/actions";

/**
 * Reuses features/members/actions.ts's removeMember() directly -- the same
 * server action Role Management's own Delete button calls, which wraps
 * removeMemberForOrganization (features/members/membership.ts). No new
 * removal mechanism: this only removes the caller's *membership* row in
 * the currently-scoped organization (organization_id + profile_id), never
 * the person's auth.users row, profiles row, other-organization
 * memberships, or their submissions/comments. Self-removal, a non-owner
 * removing an owner, and removing the organization's last remaining owner
 * are all still independently rejected server-side/by the DB trigger
 * (enforce_membership_owner_delete_protection) exactly as before -- this
 * component adds no authorization logic of its own and doesn't hide the
 * control on the caller's own row, matching Role Management's own "never
 * rely on UI hiding as the authorization boundary" convention.
 */
export function RemoveMemberButton({
  membershipId,
  memberName,
  organizationName,
}: {
  membershipId: string;
  memberName: string;
  organizationName: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={isPending}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setConfirmOpen(true)}
      >
        <UserMinus className="size-4" aria-hidden="true" />
        Remove from Organization
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove member?"
        description={`Are you sure you want to remove ${memberName} from ${organizationName}? This will remove their access to this organization but will not delete their account.`}
        confirmLabel="Remove from Organization"
        destructive
        onConfirm={() =>
          startTransition(async () => {
            const result = await removeMember(membershipId);
            if (!result.ok) toast.error(result.message ?? "Something went wrong.");
          })
        }
      />
    </>
  );
}
