"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Plus, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { UNITS } from "../types";

export function InlineAddRow({
  projectId,
  existingCount,
  defaultSection,
  isLocked,
  externalShow,
  onClose,
  existingSections = [],
}: {
  projectId: string;
  existingCount: number;
  defaultSection?: string;
  isLocked?: boolean;
  externalShow?: boolean;
  onClose?: () => void;
  existingSections?: string[];
}) {
  const utils = trpc.useUtils() as any;
  const [internalShow, setInternalShow] = useState(false);
  const show = externalShow ?? internalShow;
  const setShow = (v: boolean) => {
    if (externalShow !== undefined) {
      if (!v && onClose) onClose();
    } else {
      setInternalShow(v);
    }
  };
  const [section, setSection] = useState(defaultSection ?? "");
  const [newSectionName, setNewSectionName] = useState("");
  const [code, setCode] = useState(String(existingCount + 1));
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("cum");
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");

  const mutation = trpc.boq.create.useMutation({
    onSuccess: () => {
      utils.boq.list.invalidate({ projectId });
      toast.success("Item added");
      setDescription("");
      setQuantity("");
      setRate("");
      setCode(String(existingCount + 2));
    },
    onError: (e) => toast.error(e.message),
  });

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isLocked) {
        toast.error("BOQ is locked.");
        return;
      }
      // Resolve final section: if user picked "__new__", use the typed name; if empty, use undefined
      const finalSection =
        section === "__new__"
          ? newSectionName.trim() || undefined
          : section || undefined;
      mutation.mutate({
        projectId,
        code: code || String(existingCount + 1),
        description: description.trim(),
        unit,
        quantity: parseFloat(quantity) || 0,
        rate: parseFloat(rate) || 0,
        section: finalSection,
      });
    }
    if (e.key === "Escape") {
      setShow(false);
      setDescription("");
      setQuantity("");
      setRate("");
      setNewSectionName("");
    }
  }

  if (!show) {
    // When externally controlled, render nothing (the trigger lives in the action bar).
    // When internally controlled (legacy empty-state mode), show the inline + button.
    if (externalShow !== undefined) return null;
    return (
      <tr className="border-b">
        <td colSpan={9} className="px-3 py-1.5">
          <button
            onClick={() => {
              setInternalShow(true);
              setCode(String(existingCount + 1));
            }}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-primary/40 py-1.5 text-sm text-primary hover:bg-primary/5"
          >
            <Plus className="h-4 w-4" />{" "}
            {defaultSection ? `Add item to ${defaultSection}` : "Add BOQ item"}
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b bg-primary/5">
      <td className="px-3 py-1.5">
        <button
          onClick={() => {
            if (isLocked) {
              toast.error("BOQ is locked.");
              return;
            }
            const finalSection =
              section === "__new__"
                ? newSectionName.trim() || undefined
                : section || undefined;
            mutation.mutate({
              projectId,
              code: code || String(existingCount + 1),
              description: description.trim(),
              unit,
              quantity: parseFloat(quantity) || 0,
              rate: parseFloat(rate) || 0,
              section: finalSection,
            });
          }}
          disabled={mutation.isPending || !description.trim()}
          className="flex h-6 w-6 items-center justify-center rounded bg-primary text-white disabled:opacity-40"
          title="Add item (Enter)"
        >
          {mutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
        </button>
      </td>
      <td className="px-3 py-1.5">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Code"
          className="w-16 rounded border bg-background px-1 py-0.5 text-xs font-mono"
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Description — type and press Enter"
          className="min-w-[200px] flex-1 rounded border bg-background px-1 py-0.5 text-xs"
          autoFocus
        />
      </td>
      <td className="px-3 py-1.5">
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-16 rounded border bg-background px-1 py-0.5 text-xs"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-1.5">
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          onKeyDown={handleKeyDown}
          type="text"
          inputMode="decimal"
          placeholder="0"
          className="w-20 rounded border bg-background px-1 py-0.5 text-right text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0"
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          onKeyDown={handleKeyDown}
          type="text"
          inputMode="decimal"
          placeholder="0"
          className="w-24 rounded border bg-background px-1 py-0.5 text-right text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0"
        />
      </td>
      <td className="px-3 py-1.5 text-right text-xs text-muted-foreground">
        NPR{" "}
        {(
          (parseFloat(quantity) || 0) * (parseFloat(rate) || 0)
        ).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
      </td>
      <td className="px-3 py-1.5">
        {!defaultSection && (
          <div className="flex flex-col gap-1">
            <select
              value={section}
              onChange={(e) => {
                setSection(e.target.value);
                if (e.target.value !== "__new__") setNewSectionName("");
              }}
              onKeyDown={handleKeyDown}
              className="w-32 rounded border bg-background px-1 py-0.5 text-xs"
            >
              <option value="">— Section —</option>
              {existingSections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="__new__">+ New section…</option>
            </select>
            {section === "__new__" && (
              <input
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="New section name"
                autoFocus
                className="w-32 rounded border bg-background px-1 py-0.5 text-xs"
              />
            )}
          </div>
        )}
      </td>
      <td className="px-3 py-1.5">
        <button
          onClick={() => {
            setShow(false);
            setDescription("");
            setQuantity("");
            setRate("");
            setNewSectionName("");
          }}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Cancel (Esc)"
        >
          <X className="h-3 w-3" />
        </button>
      </td>
    </tr>
  );
}
