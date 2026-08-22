"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { ConfirmDialog } from "@/components/states/confirm-dialog";
import { EmptyState } from "@/components/states/empty-state";
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
import { Textarea } from "@/components/ui/textarea";

import {
  createCategory,
  deleteCategory,
  moveCategory,
  updateCategory,
} from "./actions";
import {
  initialCategoryFormState,
  MAX_CATEGORY_DESCRIPTION_LENGTH,
  MAX_CATEGORY_NAME_LENGTH,
} from "./form-state";
import type { Category } from "./queries";

/**
 * Only ever mounted while its dialog is open (see the `open ? <.../> : null`
 * callers below), so useActionState always starts from a fresh
 * initialCategoryFormState -- otherwise a completed action's state would
 * persist across close/reopen and the success-detection effect below would
 * fire immediately on reopen instead of only after a real submission.
 */
function CreateCategoryForm({ onSuccess }: { onSuccess: () => void }) {
  const [state, formAction, isPending] = useActionState(createCategory, initialCategoryFormState);

  useEffect(() => {
    if (state !== initialCategoryFormState && state.status === "idle") {
      onSuccess();
    }
  }, [state, onSuccess]);

  return (
    <>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <form action={formAction} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="category-name">Name</Label>
          <Input id="category-name" name="name" required maxLength={MAX_CATEGORY_NAME_LENGTH} />
          {state.fieldErrors?.name ? (
            <p className="text-xs text-destructive">{state.fieldErrors.name}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category-description">Description (optional)</Label>
          <Textarea
            id="category-description"
            name="description"
            maxLength={MAX_CATEGORY_DESCRIPTION_LENGTH}
          />
          {state.fieldErrors?.description ? (
            <p className="text-xs text-destructive">{state.fieldErrors.description}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating…" : "Create category"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function CreateCategoryDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" aria-hidden="true" />
          New category
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New category</DialogTitle>
        </DialogHeader>
        {open ? <CreateCategoryForm onSuccess={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditCategoryForm({
  category,
  onSuccess,
}: {
  category: Category;
  onSuccess: () => void;
}) {
  const boundUpdate = updateCategory.bind(null, category.id);
  const [state, formAction, isPending] = useActionState(boundUpdate, initialCategoryFormState);

  useEffect(() => {
    if (state !== initialCategoryFormState && state.status === "idle") {
      onSuccess();
    }
  }, [state, onSuccess]);

  return (
    <>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <form action={formAction} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor={`category-name-${category.id}`}>Name</Label>
          <Input
            id={`category-name-${category.id}`}
            name="name"
            defaultValue={category.name}
            required
            maxLength={MAX_CATEGORY_NAME_LENGTH}
          />
          {state.fieldErrors?.name ? (
            <p className="text-xs text-destructive">{state.fieldErrors.name}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`category-description-${category.id}`}>Description (optional)</Label>
          <Textarea
            id={`category-description-${category.id}`}
            name="description"
            defaultValue={category.description ?? ""}
            maxLength={MAX_CATEGORY_DESCRIPTION_LENGTH}
          />
        </div>
        <Label
          htmlFor={`category-active-${category.id}`}
          className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5 font-normal"
        >
          <Checkbox id={`category-active-${category.id}`} name="isActive" defaultChecked={category.isActive} />
          Active (visible to customers and the public portal)
        </Label>
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function EditCategoryDialog({
  category,
  open,
  onOpenChange,
}: {
  category: Category;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit category</DialogTitle>
        </DialogHeader>
        {open ? <EditCategoryForm category={category} onSuccess={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

export interface CategoryPermissions {
  create: boolean;
  edit: boolean;
  delete: boolean;
}

function CategoryRow({
  category,
  isFirst,
  isLast,
  permissions,
}: {
  category: Category;
  isFirst: boolean;
  isLast: boolean;
  permissions: CategoryPermissions;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const showControls = permissions.edit || permissions.delete;

  return (
    <div className="group flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_8px_24px_-12px_hsl(var(--shadow-color)/0.3)]">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/10"
        >
          <FolderKanban className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{category.name}</span>
            {!category.isActive ? <Badge variant="secondary">Inactive</Badge> : null}
          </div>
          {category.description ? (
            <p className="truncate text-xs text-muted-foreground">{category.description}</p>
          ) : null}
        </div>
      </div>
      {showControls ? (
        <div className="flex shrink-0 items-center gap-0.5 opacity-80 transition-opacity duration-150 group-hover:opacity-100">
          {permissions.edit ? (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Move up"
                disabled={isFirst || isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await moveCategory(category.id, "up");
                    if (!result.ok) toast.error(result.message ?? "Something went wrong.");
                  })
                }
              >
                <ArrowUp className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Move down"
                disabled={isLast || isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await moveCategory(category.id, "down");
                    if (!result.ok) toast.error(result.message ?? "Something went wrong.");
                  })
                }
              >
                <ArrowDown className="size-3.5" aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setEditOpen(true)}>
                <Pencil className="size-3.5" aria-hidden="true" />
              </Button>
            </>
          ) : null}
          {permissions.delete ? (
            <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ) : null}
      {permissions.edit ? (
        <EditCategoryDialog category={category} open={editOpen} onOpenChange={setEditOpen} />
      ) : null}
      {permissions.delete ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Delete "${category.name}"?`}
          description="Submissions in this category will keep their history but lose their category."
          confirmLabel="Delete"
          destructive
          onConfirm={() =>
            startTransition(async () => {
              const result = await deleteCategory(category.id);
              if (!result.ok) toast.error(result.message ?? "Something went wrong.");
            })
          }
        />
      ) : null}
    </div>
  );
}

/**
 * `permissions` mirrors categories:create/edit/delete (lib/authorization/registry.ts)
 * exactly -- server-side checks in ./actions.ts (requireAction, backed by
 * RLS extended by 0013_membership_action_permissions.sql) remain the actual
 * authorization boundary regardless of these props. This only controls
 * whether a control the caller could never successfully use is rendered at
 * all, so a "view + create only" grant sees a Create button but no Edit/
 * Delete icons, matching the spec's own example verbatim, instead of a
 * permission-denied toast after clicking something invisible-until-clicked.
 */
export function CategoryManager({
  categories,
  permissions,
}: {
  categories: Category[];
  permissions: CategoryPermissions;
}) {
  return (
    <div className="space-y-4">
      {permissions.create ? (
        <div className="flex justify-end">
          <CreateCategoryDialog />
        </div>
      ) : null}
      {categories.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="size-5" aria-hidden="true" />}
          title="No categories yet"
          description="Categories let customers and your team browse feedback by topic."
        />
      ) : (
        <div className="space-y-2">
          {categories.map((category, index) => (
            <CategoryRow
              key={category.id}
              category={category}
              isFirst={index === 0}
              isLast={index === categories.length - 1}
              permissions={permissions}
            />
          ))}
        </div>
      )}
    </div>
  );
}
