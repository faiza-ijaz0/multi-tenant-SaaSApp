"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/states/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { deleteOrganization } from "./actions";

/**
 * One shared confirm-dialog wiring, two entry points: a compact icon button
 * for the Organization Card's action row, and a full-width destructive
 * button for the Danger Zone section -- both call the exact same
 * deleteOrganization() server action (never a duplicate implementation).
 * On success that action redirects itself (see features/organizations/actions.ts);
 * this component only ever handles the failure case, same "await, then
 * check result.ok" convention as features/members/accept-invitation-button.tsx.
 */
export function DeleteOrganizationButton({
  organizationName,
  variant,
}: {
  organizationName: string;
  variant: "icon" | "full";
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteOrganization();
      if (result && !result.ok) toast.error(result.message ?? "Something went wrong.");
    });
  }

  return (
    <>
      {variant === "icon" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={isPending}
              aria-label="Delete organization"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      ) : (
        <Button variant="destructive" disabled={isPending} onClick={() => setConfirmOpen(true)}>
          <Trash2 aria-hidden="true" />
          {isPending ? "Deleting…" : "Delete Organization"}
        </Button>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete organization?"
        description={`This permanently deletes "${organizationName}" and everything in it -- submissions, categories, statuses, members, and the public portal. This cannot be undone.`}
        confirmLabel={isPending ? "Deleting…" : "Delete organization"}
        destructive
        onConfirm={handleConfirm}
      />
    </>
  );
}
