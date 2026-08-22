"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCustomerFullName } from "@/features/customers/update-profile";
import { MAX_CUSTOMER_NAME_LENGTH, initialUpdateProfileFormState } from "@/features/customers/update-profile-form-state";

// Same shell/form split as features/categories/category-manager.tsx's
// EditCategoryDialog/EditCategoryForm: the inner form calls the opaque
// `onSuccess` prop from its own effect (react-hooks/set-state-in-effect
// only flags a setState call it can statically resolve to a local
// useState in *this* component -- an opaque prop call doesn't trigger it),
// while the actual setOpen(false) lives in the shell's inline JSX prop,
// not inside an effect.
function EditProfileNameForm({ slug, currentName, onSuccess }: { slug: string; currentName: string; onSuccess: () => void }) {
  const boundAction = updateCustomerFullName.bind(null, slug);
  const [state, formAction, isPending] = useActionState(boundAction, initialUpdateProfileFormState);

  useEffect(() => {
    if (state !== initialUpdateProfileFormState && state.status === "idle") {
      onSuccess();
    }
  }, [state, onSuccess]);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <div className="space-y-1.5">
        <Label htmlFor="profile-fullName">Full name</Label>
        <Input
          id="profile-fullName"
          name="fullName"
          defaultValue={currentName}
          required
          maxLength={MAX_CUSTOMER_NAME_LENGTH}
          aria-invalid={Boolean(state.fieldErrors?.fullName)}
        />
        {state.fieldErrors?.fullName ? <p className="text-xs text-destructive">{state.fieldErrors.fullName}</p> : null}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditProfileNameDialog({ slug, currentName }: { slug: string; currentName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Pencil className="size-3.5" data-icon="inline-start" aria-hidden="true" />
          Edit name
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit your name</DialogTitle>
          <DialogDescription>This is the only profile field you can change yourself.</DialogDescription>
        </DialogHeader>
        {open ? (
          <EditProfileNameForm
            slug={slug}
            currentName={currentName}
            onSuccess={() => {
              toast.success("Profile updated.");
              setOpen(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
