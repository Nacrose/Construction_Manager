"use client";

/**
 * Engine form field kit — Tier 2 companion to FormDialogEngine (Phase B).
 *
 * OWNS: the sanctioned frameless field rendering inside engine dialogs —
 * labels, inputs, error/helper text, Nepali + native date inputs, currency
 * with live amount-in-words, selects, textareas, switches.
 *
 * Every field reads values/errors from the FormDialogEngine context, so a
 * dialog body is pure declaration: no per-field useState, no per-field wiring.
 *
 * Tokens: Light Ice-Blue Aero — bg-white surfaces, #c7d8e8 borders, azure
 * focus, red-600 errors. Hardcodes here are the engine's own sanctioned
 * anatomy (same classes the converted Aero dialogs use); pages must not
 * re-style fields ad hoc — extend the kit instead.
 *
 * Extracted from the never-adopted speculative `ui/form-engine.tsx`
 * (deleted in Phase B); component names are kept identical so future
 * migrations are greppable.
 */

import * as React from "react";
import { formatNpr, amountInWords } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NepaliDatePicker } from "@/components/ui/nepali-date-picker";
import { useFormDialog } from "@/components/engine/form-dialog-engine";

export interface EngineFieldProps {
  name: string;
  label: string;
  required?: boolean;
  helperText?: string;
  /** Grid columns to span (the dialog body is a 2-col grid by default). */
  colSpan?: 1 | 2 | "full";
  className?: string;
}

const colSpanClasses: Record<string, string> = {
  1: "col-span-1",
  2: "col-span-full sm:col-span-1",
  full: "col-span-full",
};

function FieldShell({
  name,
  label,
  required,
  helperText,
  colSpan = 1,
  className,
  children,
}: EngineFieldProps & { children: React.ReactNode }) {
  const { errors } = useFormDialog();
  const error = errors[name];

  return (
    <div className={cn("space-y-1.5 min-w-0", colSpanClasses[colSpan], className)}>
      <Label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
        {label}
        {required && <span className="text-red-600">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[10px] text-red-600 font-mono">{error}</p>
      ) : helperText ? (
        <p className="text-[10px] text-slate-500 font-mono">{helperText}</p>
      ) : null}
    </div>
  );
}

const INPUT_CLASSES =
  "h-9 text-xs bg-white rounded-lg border-[#c7d8e8] text-slate-900 placeholder:text-slate-400 focus:border-[#0284c7]";

/** Single-line text input. */
export function FormTextField({
  name,
  label,
  required,
  helperText,
  colSpan,
  className,
  placeholder,
  type = "text",
}: EngineFieldProps & { placeholder?: string; type?: string }) {
  const { values, setValue, disabled } = useFormDialog();

  return (
    <FieldShell name={name} label={label} required={required} helperText={helperText} colSpan={colSpan} className={className}>
      <Input
        type={type}
        value={(values[name] as string) ?? ""}
        onChange={(e) => setValue(name, e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={INPUT_CLASSES}
      />
    </FieldShell>
  );
}

/** Numeric input with optional unit suffix (rendered inside the input). */
export function FormNumberField({
  name,
  label,
  required,
  helperText,
  colSpan,
  className,
  placeholder,
  min,
  max,
  step = "any",
  unit,
}: EngineFieldProps & {
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number | string;
  unit?: string;
}) {
  const { values, setValue, disabled } = useFormDialog();

  return (
    <FieldShell name={name} label={label} required={required} helperText={helperText} colSpan={colSpan} className={className}>
      <div className="relative">
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={(values[name] as number | string | undefined) ?? ""}
          onChange={(e) => setValue(name, e.target.value === "" ? undefined : parseFloat(e.target.value))}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(INPUT_CLASSES, "font-mono", unit && "pr-12")}
        />
        {unit && (
          <span className="absolute right-3 top-2.5 text-[10px] font-mono text-slate-500 pointer-events-none">{unit}</span>
        )}
      </div>
    </FieldShell>
  );
}

/** Currency input (NPR) with live formatted readout and optional amount-in-words. */
export function FormCurrencyField({
  name,
  label,
  required,
  helperText,
  colSpan,
  className,
  placeholder = "0.00",
  showWords = true,
  lang = "en",
}: EngineFieldProps & { placeholder?: string; showWords?: boolean; lang?: "en" | "np" }) {
  const { values, setValue, errors, disabled } = useFormDialog();
  const rawValue = values[name] as number | string | undefined;
  const numValue = typeof rawValue === "number" ? rawValue : parseFloat(rawValue ?? "") || 0;
  const words = showWords && numValue > 0 ? amountInWords(numValue, lang) : null;

  return (
    <FieldShell name={name} label={label} required={required} helperText={helperText} colSpan={colSpan} className={className}>
      <div className="relative">
        <span className="absolute left-3 top-2.5 text-[10px] font-mono text-slate-500 font-semibold pointer-events-none">
          NPR
        </span>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={rawValue ?? ""}
          onChange={(e) => setValue(name, e.target.value === "" ? undefined : parseFloat(e.target.value))}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(INPUT_CLASSES, "pl-11 font-mono", errors[name] && "border-red-500/60 focus:border-red-500")}
        />
      </div>
      {numValue > 0 && (
        <p className="text-[10px] font-mono text-emerald-700 font-bold">{formatNpr(numValue, { prefix: "NPR" })}</p>
      )}
      {words && (
        <div className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[10px] text-emerald-800 font-sans italic leading-tight">
          {words}
        </div>
      )}
    </FieldShell>
  );
}

/** Native date input (yyyy-MM-dd strings — matches the common tRPC input shape). */
export function FormDateField({
  name,
  label,
  required,
  helperText,
  colSpan,
  className,
}: EngineFieldProps) {
  const { values, setValue, errors, disabled } = useFormDialog();

  return (
    <FieldShell name={name} label={label} required={required} helperText={helperText} colSpan={colSpan} className={className}>
      <Input
        type="date"
        value={(values[name] as string) ?? ""}
        onChange={(e) => setValue(name, e.target.value)}
        disabled={disabled}
        className={cn(INPUT_CLASSES, "font-mono", errors[name] && "border-red-500/60 focus:border-red-500")}
      />
    </FieldShell>
  );
}

/** Nepali calendar (BS) dual-readout date picker. Stores ISO string. */
export function FormNepaliDateField({
  name,
  label,
  required,
  helperText,
  colSpan,
  className,
}: EngineFieldProps) {
  const { values, setValue, errors, disabled } = useFormDialog();
  const rawValue = values[name] as string | null | undefined;
  const dateValue = rawValue ? new Date(rawValue) : null;

  return (
    <FieldShell name={name} label={label} required={required} helperText={helperText} colSpan={colSpan} className={className}>
      <NepaliDatePicker
        value={dateValue}
        onChange={(date) => setValue(name, date ? date.toISOString() : null)}
        disabled={disabled}
        className={cn(
          "w-full h-9 text-xs font-mono rounded-lg border border-[#c7d8e8] bg-white text-slate-900",
          errors[name] && "border-red-500/60",
          className,
        )}
      />
    </FieldShell>
  );
}

/** Select with static options. */
export function FormSelectField({
  name,
  label,
  required,
  helperText,
  colSpan,
  className,
  placeholder = "Select...",
  options,
}: EngineFieldProps & {
  placeholder?: string;
  options: { label: string; value: string }[];
}) {
  const { values, setValue, errors, disabled } = useFormDialog();

  return (
    <FieldShell name={name} label={label} required={required} helperText={helperText} colSpan={colSpan} className={className}>
      <Select value={(values[name] as string) ?? ""} onValueChange={(val) => setValue(name, val)} disabled={disabled}>
        <SelectTrigger
          className={cn(
            "w-full min-w-0 h-9 text-xs bg-white text-slate-900 rounded-lg border-[#c7d8e8] focus:border-[#0284c7]",
            errors[name] && "border-red-500/60",
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="bg-white border border-[#c7d8e8] text-xs text-slate-900 shadow-xl rounded-xl">
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}

/** Multi-line textarea. */
export function FormTextareaField({
  name,
  label,
  required,
  helperText,
  colSpan = "full",
  className,
  placeholder,
  rows = 3,
}: EngineFieldProps & { placeholder?: string; rows?: number }) {
  const { values, setValue, disabled } = useFormDialog();

  return (
    <FieldShell name={name} label={label} required={required} helperText={helperText} colSpan={colSpan} className={className}>
      <Textarea
        rows={rows}
        value={(values[name] as string) ?? ""}
        onChange={(e) => setValue(name, e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "text-xs bg-white rounded-lg border-[#c7d8e8] text-slate-900 placeholder:text-slate-400 focus:border-[#0284c7] resize-none",
        )}
      />
    </FieldShell>
  );
}

/** Boolean toggle rendered as a full-width row (frameless, no nested card). */
export function FormSwitchField({
  name,
  label,
  helperText,
  colSpan,
  className,
}: Omit<EngineFieldProps, "required">) {
  const { values, setValue, disabled } = useFormDialog();
  const checked = !!values[name];
  const spanClass = colSpan ? colSpanClasses[colSpan] : colSpanClasses.full;
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1 min-w-0", spanClass, className)}>
      <div className="space-y-0.5 min-w-0">
        <Label className="text-[11px] font-semibold text-slate-700 cursor-pointer">{label}</Label>
        {helperText && <p className="text-[10px] text-slate-500 font-mono">{helperText}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={(val) => setValue(name, val)} disabled={disabled} />
    </div>
  );
}
