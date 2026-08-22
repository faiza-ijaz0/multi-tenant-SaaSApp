"use client";

import { type FormEvent, useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { changeMemberPassword, type ChangeMemberPasswordResult } from "./change-password";

const initialResult: ChangeMemberPasswordResult = { ok: true };

/**
 * Only ever mounted while its dialog is open, same remount-on-reopen
 * convention as MemberEditForm/CreateMemberForm -- local state always
 * starts fresh.
 */
function ChangePasswordForm({
  membershipId,
  memberLabel,
  memberEmail,
  onClose,
}: {
  membershipId: string;
  memberLabel: string;
  memberEmail: string | null;
  onClose: () => void;
}) {
  const [result, setResult] = useState<ChangeMemberPasswordResult>(initialResult);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const next = await changeMemberPassword(membershipId, formData);
      setResult(next);
      if (next.ok) {
        toast.success("Password changed.");
        form.reset();
        onClose();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <FormError message={!result.ok ? result.message : undefined} />

        <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5">
          <p className="text-sm font-medium text-foreground">{memberLabel}</p>
          {memberEmail ? <p className="text-xs text-muted-foreground">{memberEmail}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="change-password-new">New password</Label>
          <Input
            id="change-password-new"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            aria-invalid={Boolean(result.fieldErrors?.password)}
          />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          {result.fieldErrors?.password ? (
            <p className="text-xs text-destructive">{result.fieldErrors.password}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="change-password-confirm">Confirm new password</Label>
          <Input
            id="change-password-confirm"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            aria-invalid={Boolean(result.fieldErrors?.confirmPassword)}
          />
          {result.fieldErrors?.confirmPassword ? (
            <p className="text-xs text-destructive">{result.fieldErrors.confirmPassword}</p>
          ) : null}
        </div>
      </div>

      <DialogFooter className="mx-0 mb-0 shrink-0 rounded-b-xl border-t border-border/70 bg-muted/40 px-5 py-4">
        <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Change password"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ChangePasswordDialog({
  membershipId,
  memberLabel,
  memberEmail,
}: {
  membershipId: string;
  memberLabel: string;
  memberEmail: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Change password for ${memberLabel}`}>
              <KeyRound className="size-4" aria-hidden="true" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Change password</TooltipContent>
      </Tooltip>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 gap-1 border-b border-border/70 px-5 py-4 pr-10">
          <DialogTitle>Change Password</DialogTitle>
        </DialogHeader>
        {open ? (
          <ChangePasswordForm
            membershipId={membershipId}
            memberLabel={memberLabel}
            memberEmail={memberEmail}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
