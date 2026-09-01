"use client";

import React, { createContext, useContext, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { NepaliDatePicker } from "@/components/ui/nepali-date-picker";
import { formatNpr, amountInWords } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

// Form Context for Central State Management
type FormContextType = {
  values: Record<string, any>;
  setValue: (name: string, value: any) => void;
  errors: Record<string, string>;
  isSubmitting: boolean;
  disabled?: boolean;
};

const FormContext = createContext<FormContextType | null>(null);

export function useFormContext() {
  const ctx = useContext(FormContext);
  if (!ctx) {
    throw new Error("useFormContext must be used within a ConstructionForm");
  }
  return ctx;
}

export interface ConstructionFormProps<T extends Record<string, any>> {
  initialValues: T;
  onSubmit: (values: T) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  children: React.ReactNode;
  className?: string;
  columns?: 1 | 2 | 3 | 4;
  disabled?: boolean;
}

export function ConstructionForm<T extends Record<string, any>>({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = "Save & Submit",
  cancelLabel = "Cancel",
  children,
  className,
  columns = 2,
  disabled = false,
}: ConstructionFormProps<T>) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const setValue = (name: string, value: any) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        await onSubmit(values);
      } catch (err: any) {
        if (err?.message) {
          setErrors({ form: err.message });
        }
      }
    });
  };

  const gridCols = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 md:grid-cols-4",
  }[columns];

  return (
    <FormContext.Provider
      value={{
        values,
        setValue,
        errors,
        isSubmitting: isPending,
        disabled,
      }}
    >
      <form onSubmit={handleSubmit} className={cn("space-y-5", className)}>
        {errors.form && (
          <div className="p-3 text-xs rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-mono">
            {errors.form}
          </div>
        )}

        <div className={cn("grid gap-4", gridCols)}>{children}</div>

        {/* Standardized Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#c7d8e8]">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending || disabled}
              onClick={onCancel}
              className="h-9 px-4 text-xs font-mono bg-transparent border-[#c7d8e8] hover:bg-slate-50 text-slate-700"
            >
              {cancelLabel}
            </Button>
          )}

          <Button
            type="submit"
            size="sm"
            disabled={isPending || disabled}
            className="h-9 px-5 text-xs font-semibold gap-2 bg-emerald-600 hover:bg-emerald-500 text-slate-900 shadow-sm"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </form>
    </FormContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────
// Form Field Components
// ─────────────────────────────────────────────────────────────

interface BaseFieldProps {
  name: string;
  label: string;
  required?: boolean;
  helperText?: string;
  colSpan?: 1 | 2 | 3 | 4 | "full";
  className?: string;
}

const colSpanClasses = {
  1: "col-span-1",
  2: "sm:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
  full: "col-span-full",
};

/**
 * Text Input Field
 */
export function FormTextField({
  name,
  label,
  required,
  helperText,
  colSpan = 1,
  className,
  placeholder,
  type = "text",
}: BaseFieldProps & {
  placeholder?: string;
  type?: string;
}) {
  const { values, setValue, errors, disabled } = useFormContext();
  const value = values[name] ?? "";
  const error = errors[name];

  return (
    <div className={cn("space-y-1.5", colSpanClasses[colSpan], className)}>
      <Label className="text-xs text-slate-700 font-medium flex items-center gap-1">
        {label}
        {required && <span className="text-red-400">*</span>}
      </Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => setValue(name, e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 placeholder:text-gray-500 rounded-xl focus:border-[#0284c7]",
          error && "border-red-500/50 focus:border-red-500"
        )}
      />
      {error ? (
        <p className="text-[10px] text-red-400 font-mono">{error}</p>
      ) : helperText ? (
        <p className="text-[10px] text-slate-500 font-mono">{helperText}</p>
      ) : null}
    </div>
  );
}

/**
 * Numeric Field with Unit Suffix
 */
export function FormNumberField({
  name,
  label,
  required,
  helperText,
  colSpan = 1,
  className,
  placeholder,
  min,
  max,
  step = "any",
  unit,
}: BaseFieldProps & {
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number | string;
  unit?: string;
}) {
  const { values, setValue, errors, disabled } = useFormContext();
  const value = values[name] ?? "";
  const error = errors[name];

  return (
    <div className={cn("space-y-1.5", colSpanClasses[colSpan], className)}>
      <Label className="text-xs text-slate-700 font-medium flex items-center gap-1">
        {label}
        {unit && <span className="text-slate-500 font-mono text-[10px]">({unit})</span>}
        {required && <span className="text-red-400">*</span>}
      </Label>
      <div className="relative">
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => setValue(name, e.target.value === "" ? "" : parseFloat(e.target.value))}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            "h-9 text-xs font-mono bg-white border-[#c7d8e8] text-slate-900 placeholder:text-gray-500 rounded-xl focus:border-[#0284c7]",
            unit && "pr-12",
            error && "border-red-500/50 focus:border-red-500"
          )}
        />
        {unit && (
          <span className="absolute right-3 top-2.5 text-[10px] font-mono text-slate-500 pointer-events-none">
            {unit}
          </span>
        )}
      </div>
      {error ? (
        <p className="text-[10px] text-red-400 font-mono">{error}</p>
      ) : helperText ? (
        <p className="text-[10px] text-slate-500 font-mono">{helperText}</p>
      ) : null}
    </div>
  );
}

/**
 * Currency Input Field with Live "Amount In Words" Readout
 */
export function FormCurrencyField({
  name,
  label,
  required,
  helperText,
  colSpan = 1,
  className,
  placeholder = "0.00",
  showWords = true,
  lang = "en",
}: BaseFieldProps & {
  placeholder?: string;
  showWords?: boolean;
  lang?: "en" | "np";
}) {
  const { values, setValue, errors, disabled } = useFormContext();
  const rawValue = values[name] ?? 0;
  const numValue = typeof rawValue === "number" ? rawValue : parseFloat(rawValue) || 0;
  const error = errors[name];

  const words = showWords && numValue > 0 ? amountInWords(numValue, lang) : null;

  return (
    <div className={cn("space-y-1.5", colSpanClasses[colSpan], className)}>
      <Label className="text-xs text-slate-700 font-medium flex items-center justify-between">
        <span className="flex items-center gap-1">
          {label}
          {required && <span className="text-red-400">*</span>}
        </span>
        {numValue > 0 && (
          <span className="font-mono text-[10px] text-emerald-400 font-bold">
            {formatNpr(numValue, { prefix: "NPR" })}
          </span>
        )}
      </Label>

      <div className="relative">
        <span className="absolute left-3 top-2.5 text-[10px] font-mono text-slate-500 font-semibold pointer-events-none">
          NPR
        </span>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={values[name] ?? ""}
          onChange={(e) => setValue(name, e.target.value === "" ? "" : parseFloat(e.target.value))}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            "pl-12 h-9 text-xs font-mono bg-white border-[#c7d8e8] text-slate-900 placeholder:text-gray-500 rounded-xl focus:border-[#0284c7]",
            error && "border-red-500/50 focus:border-red-500"
          )}
        />
      </div>

      {words && (
        <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-300 font-sans italic leading-tight">
          📝 {words}
        </div>
      )}

      {error ? (
        <p className="text-[10px] text-red-400 font-mono">{error}</p>
      ) : helperText ? (
        <p className="text-[10px] text-slate-500 font-mono">{helperText}</p>
      ) : null}
    </div>
  );
}

/**
 * Nepali Calendar Dual-Date (AD/BS) Picker Field
 */
export function FormNepaliDateField({
  name,
  label,
  required,
  helperText,
  colSpan = 1,
  className,
}: BaseFieldProps) {
  const { values, setValue, errors, disabled } = useFormContext();
  const value = values[name] ? new Date(values[name]) : null;
  const error = errors[name];

  return (
    <div className={cn("space-y-1.5", colSpanClasses[colSpan], className)}>
      <Label className="text-xs text-slate-700 font-medium flex items-center gap-1">
        {label}
        {required && <span className="text-red-400">*</span>}
      </Label>
      <NepaliDatePicker
        value={value}
        onChange={(date) => setValue(name, date ? date.toISOString() : null)}
        disabled={disabled}
        className={cn(
          "w-full h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 rounded-xl",
          error && "border-red-500/50"
        )}
      />
      {error ? (
        <p className="text-[10px] text-red-400 font-mono">{error}</p>
      ) : helperText ? (
        <p className="text-[10px] text-slate-500 font-mono">{helperText}</p>
      ) : null}
    </div>
  );
}

/**
 * Select Field
 */
export function FormSelectField({
  name,
  label,
  required,
  helperText,
  colSpan = 1,
  className,
  placeholder = "Select...",
  options,
}: BaseFieldProps & {
  placeholder?: string;
  options: { label: string; value: string }[];
}) {
  const { values, setValue, errors, disabled } = useFormContext();
  const value = values[name] ?? "";
  const error = errors[name];

  return (
    <div className={cn("space-y-1.5", colSpanClasses[colSpan], className)}>
      <Label className="text-xs text-slate-700 font-medium flex items-center gap-1">
        {label}
        {required && <span className="text-red-400">*</span>}
      </Label>
      <Select value={value} onValueChange={(val) => setValue(name, val)} disabled={disabled}>
        <SelectTrigger
          className={cn(
            "h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 rounded-xl focus:border-[#0284c7]",
            error && "border-red-500/50"
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="bg-white border-[#c7d8e8] text-xs text-slate-900">
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p className="text-[10px] text-red-400 font-mono">{error}</p>
      ) : helperText ? (
        <p className="text-[10px] text-slate-500 font-mono">{helperText}</p>
      ) : null}
    </div>
  );
}

/**
 * Multi-Line Textarea Field
 */
export function FormTextareaField({
  name,
  label,
  required,
  helperText,
  colSpan = "full",
  className,
  placeholder,
  rows = 3,
}: BaseFieldProps & {
  placeholder?: string;
  rows?: number;
}) {
  const { values, setValue, errors, disabled } = useFormContext();
  const value = values[name] ?? "";
  const error = errors[name];

  return (
    <div className={cn("space-y-1.5", colSpanClasses[colSpan], className)}>
      <Label className="text-xs text-slate-700 font-medium flex items-center gap-1">
        {label}
        {required && <span className="text-red-400">*</span>}
      </Label>
      <Textarea
        rows={rows}
        value={value}
        onChange={(e) => setValue(name, e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "text-xs bg-white border-[#c7d8e8] text-slate-900 placeholder:text-gray-500 rounded-xl focus:border-[#0284c7] resize-none",
          error && "border-red-500/50 focus:border-red-500"
        )}
      />
      {error ? (
        <p className="text-[10px] text-red-400 font-mono">{error}</p>
      ) : helperText ? (
        <p className="text-[10px] text-slate-500 font-mono">{helperText}</p>
      ) : null}
    </div>
  );
}

/**
 * Boolean Switch / Toggle Field
 */
export function FormSwitchField({
  name,
  label,
  helperText,
  colSpan = 1,
  className,
}: Omit<BaseFieldProps, "required">) {
  const { values, setValue, disabled } = useFormContext();
  const checked = !!values[name];

  return (
    <div
      className={cn(
        "flex items-center justify-between p-3 rounded-xl bg-white border border-[#c7d8e8]",
        colSpanClasses[colSpan],
        className
      )}
    >
      <div className="space-y-0.5">
        <Label className="text-xs text-slate-800 font-medium cursor-pointer">{label}</Label>
        {helperText && <p className="text-[10px] text-slate-500 font-mono">{helperText}</p>}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={(val) => setValue(name, val)}
        disabled={disabled}
      />
    </div>
  );
}
