"use client";

/**
 * FormDialogEngine — Tier 2 pattern engine (Phase B of the engine consolidation).
 *
 * OWNS: everything a "create / edit / submit" dialog repeats across the app —
 *   1. Aero framing: dark-glass backdrop (ui/dialog) + light 16:10-friendly
 *      content card, header band, footer band (the sanctioned anatomy from
 *      record-payment-dialog / settle-multi-bill-dialog).
 *   2. Form values state + reset-on-open (no more 5x useState per dialog).
 *   3. Optional zod validation with per-field error surfacing (fail loud).
 *   4. tRPC mutation coupling: isPending, mutateAsync on submit.
 *   5. Success protocol: toast -> invalidate -> onSuccess -> close.
 *   6. Error protocol: inline form banner + toast, never silent.
 *
 * PROTOCOL NOTES
 * - Single path: new dialogs that mutate via tRPC must be built on this engine.
 *   A dialog that re-implements Dialog+form+mutation+toast+invalidate by hand
 *   is an ad-hoc duplicate and gets rejected in review.
 * - Typed end-to-end: `mutation` accepts a real tRPC mutation procedure, so
 *   TInput/TData flow from the router. `buildInput` must produce the exact
 *   mutation input type — a wrong shape is a compile error at the call site.
 *   (Server-side zod input parsing remains the hard enforcement boundary.)
 * - Escape hatch without fork: pass `renderFooter` to replace the footer, or
 *   a render-prop child to fully control the body. Field kit lives in
 *   `@/components/engine/form-fields` and reads this engine's context.
 * - Extractive, not speculative: this engine was extracted from the leaves
 *   pilot (leaves-tab.tsx) and mirrors the anatomy of the already-converted
 *   Aero dialogs. It replaces the never-adopted speculative ui/form-engine.
 */

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** The shared tRPC utils type — callers use it for typed invalidation callbacks. */
export type RouterUtils = ReturnType<typeof trpc.useUtils>;

export interface EngineMutationResult<TInput, TData> {
  mutateAsync(variables: TInput): Promise<TData>;
  isPending: boolean;
}

export interface EngineMutationHooks<TInput, TData> {
  onSuccess?: (data: TData, variables: TInput, context: unknown) => unknown;
  onError?: (error: { message: string }) => void;
}

/**
 * Structural type that real tRPC mutation procedures satisfy. Method syntax
 * (bivariant parameters) keeps structural compatibility with tRPC's complex
 * internal signatures while preserving TInput/TData inference at call sites.
 */
export interface EngineMutationProcedure<TInput, TData> {
  useMutation(opts?: EngineMutationHooks<TInput, TData>): EngineMutationResult<TInput, TData>;
}

export interface FormDialogContextValue<TValues> {
  values: TValues;
  setValue(name: keyof TValues & string, value: unknown): void;
  errors: Record<string, string>;
  isSubmitting: boolean;
  disabled: boolean;
}

const FormDialogContext = React.createContext<FormDialogContextValue<Record<string, unknown>> | null>(null);

/** Field-kit hook — every engine field reads values/errors from this context. */
export function useFormDialog<TValues = Record<string, unknown>>(): FormDialogContextValue<TValues> {
  const ctx = React.useContext(FormDialogContext) as FormDialogContextValue<TValues> | null;
  if (!ctx) {
    throw new Error("Form fields must be rendered inside <FormDialogEngine>.");
  }
  return ctx;
}

const SIZE_CLASSES = {
  sm: "sm:max-w-md",
  md: "sm:max-w-[760px]",
  lg: "sm:max-w-[896px]",
  xl: "sm:max-w-[1024px]",
} as const;

export interface FormDialogEngineProps<TValues extends Record<string, unknown>, TInput, TData> {
  /** Dialog title (header band). */
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Optional right-side header chip (e.g. current BS date). */
  titleBadge?: React.ReactNode;

  /**
   * Controlled mode (open + onOpenChange) or uncontrolled mode (omit both;
   * render children/trigger outside via the engine's dialog — uncontrolled
   * callers open it by rendering <FormDialogEngine open={undefined}> with
   * their own trigger setting internal state is NOT supported in v1; use
   * controlled mode like every migrated page).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;

  initialValues: TValues;
  /** Optional client-side zod validation. Errors map to field names via issue path. */
  schema?: z.ZodType<TValues>;
  /** Maps validated form values to the exact tRPC mutation input. */
  buildInput: (values: TValues) => TInput;
  /** A real tRPC mutation procedure, e.g. `trpc.leave.create`. */
  mutation: EngineMutationProcedure<TInput, TData>;
  /** Typed invalidation after success, e.g. `(u) => u.leave.list.invalidate({ projectId })`. */
  invalidate?: (utils: RouterUtils) => unknown;
  successMessage?: string | ((data: TData) => string);
  onSuccess?: (data: TData, values: TValues) => void;

  submitLabel?: string;
  cancelLabel?: string;
  /** Content max width. md (760px) is the sanctioned Aero dialog width. */
  size?: keyof typeof SIZE_CLASSES;
  disabled?: boolean;
  closeOnSuccess?: boolean;
  /** Reset values to initialValues whenever the dialog opens. Default true. */
  resetOnOpen?: boolean;
  /** Optional left-aligned footer note (rendered before the action buttons). */
  footerNote?: React.ReactNode;
  /** Escape hatch: replace the entire footer (still inside the <form>). */
  renderFooter?: (ctx: FormDialogContextValue<TValues>) => React.ReactNode;

  /** Body fields, or a render-prop receiving the dialog context. */
  children: React.ReactNode | ((ctx: FormDialogContextValue<TValues>) => React.ReactNode);
}

export function FormDialogEngine<TValues extends Record<string, unknown>, TInput, TData>({
  title,
  description,
  icon: Icon,
  titleBadge,
  open,
  onOpenChange,
  initialValues,
  schema,
  buildInput,
  mutation,
  invalidate,
  successMessage,
  onSuccess,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  size = "md",
  disabled = false,
  closeOnSuccess = true,
  resetOnOpen = true,
  footerNote,
  renderFooter,
  children,
}: FormDialogEngineProps<TValues, TInput, TData>) {
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isOpen = isControlled ? (open as boolean) : internalOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const [values, setValues] = React.useState<TValues>(initialValues);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Reset to the latest initialValues each time the dialog opens.
  // Render-time state adjustment — the React-recommended alternative to
  // setState-in-effect (which would trigger a cascading render).
  const [wasOpen, setWasOpen] = React.useState(false);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen && resetOnOpen) {
      setValues(initialValues);
      setErrors({});
    }
  }

  const utils = trpc.useUtils();

  const mut = mutation.useMutation();

  const setValue = React.useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      if (!prev[name] && !prev.form) return prev;
      const next = { ...prev };
      delete next[name];
      delete next.form;
      return next;
    });
  }, []);

  const ctxValue = React.useMemo<FormDialogContextValue<TValues>>(
    () => ({ values, setValue, errors, isSubmitting: mut.isPending, disabled }),
    [values, setValue, errors, mut.isPending, disabled],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || mut.isPending) return;

    let validated: TValues = values;
    if (schema) {
      const parsed = schema.safeParse(values);
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.length > 0 ? String(issue.path[0]) : "form";
          if (!fieldErrors[key]) fieldErrors[key] = issue.message;
        }
        setErrors(fieldErrors);
        return;
      }
      validated = parsed.data as TValues;
    }

    try {
      const data = await mut.mutateAsync(buildInput(validated));
      const message =
        typeof successMessage === "function" ? successMessage(data) : (successMessage ?? "Saved successfully.");
      toast.success(message);
      if (invalidate) invalidate(utils);
      onSuccess?.(data, validated);
      if (closeOnSuccess) setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setErrors((prev) => ({ ...prev, form: message }));
      toast.error(message);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent
        className={cn(
          "w-full p-0 gap-0 bg-white border border-[#c7d8e8] text-slate-900 rounded-2xl shadow-2xl overflow-hidden font-sans",
          SIZE_CLASSES[size],
        )}
      >
        {/* Header band */}
        <div className="px-6 py-4 border-b border-[#e2edf7] bg-[#f8fbfe] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="text-base font-bold text-slate-900 tracking-tight font-sans flex items-center gap-2">
              {Icon && <Icon className="h-4 w-4 text-[#0284c7] shrink-0" aria-hidden />}
              {title}
            </DialogTitle>
            {description && <DialogDescription className="text-xs text-slate-500 mt-0.5">{description}</DialogDescription>}
          </div>
          {titleBadge}
        </div>

        <FormDialogContext.Provider value={ctxValue as unknown as FormDialogContextValue<Record<string, unknown>>}>
          <form onSubmit={handleSubmit} className="bg-white" noValidate>
            {/* Body — frameless two-column grid, zero nested cards */}
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {errors.form && (
                <div className="col-span-full px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[11px] font-mono">
                  {errors.form}
                </div>
              )}
              {typeof children === "function" ? children(ctxValue) : children}
            </div>

            {renderFooter ? (
              renderFooter(ctxValue)
            ) : (
              <DialogFooter className="px-6 py-3.5 border-t border-[#e2edf7] bg-[#f8fbfe] gap-2 sm:justify-end">
                {footerNote && <div className="mr-auto self-center text-[11px] text-slate-500 font-mono">{footerNote}</div>}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={mut.isPending || disabled}
                  onClick={() => setOpen(false)}
                  className="h-8 px-4 text-xs font-mono bg-white border-[#c7d8e8] text-slate-700 hover:bg-slate-50"
                >
                  {cancelLabel}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={mut.isPending || disabled}
                  className="h-8 px-5 text-xs font-semibold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                >
                  {mut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                  {submitLabel}
                </Button>
              </DialogFooter>
            )}
          </form>
        </FormDialogContext.Provider>
      </DialogContent>
    </Dialog>
  );
}
