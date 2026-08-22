"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  FolderTree,
  Plus,
  Trash2,
  Edit2,
  RotateCcw,
  Loader2,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export function CategoryManagerDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.paymentCategory.list.useQuery({ projectId }, { enabled: open });
  const categories = data?.categories || [];

  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [isAddingSub, setIsAddingSub] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [nameNp, setNameNp] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState("amber");

  const createMut = trpc.paymentCategory.create.useMutation({
    onSuccess: () => {
      utils.paymentCategory.list.invalidate({ projectId });
      toast.success(selectedParentId ? "Subcategory added" : "Category created");
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.paymentCategory.delete.useMutation({
    onSuccess: () => {
      utils.paymentCategory.list.invalidate({ projectId });
      toast.success("Category deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const seedMut = trpc.paymentCategory.seedDefaults.useMutation({
    onSuccess: () => {
      utils.paymentCategory.list.invalidate({ projectId });
      toast.success("Default Nepal construction & Tally/Swastik categories restored");
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setName("");
    setNameNp("");
    setCode("");
    setColor("amber");
    setIsAddingCategory(false);
    setIsAddingSub(false);
  };

  const handleCreate = (parentId?: string) => {
    if (!name.trim()) return;
    createMut.mutate({
      projectId,
      name: name.trim(),
      nameNp: nameNp.trim() || undefined,
      code: code.trim() || undefined,
      color,
      parentId: parentId || undefined,
    });
  };

  const selectedParent = categories.find((c) => c.id === selectedParentId) || categories[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden font-sans">
        <DialogHeader className="p-4 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderTree className="h-5 w-5 text-primary" />
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Cost Categories & Chart of Accounts
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Manage parent heads and subcategories (e.g. Overhead → Food/Mess, Transport) aligned with Tally & Swastik.
                </DialogDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => seedMut.mutate({ projectId })}
              disabled={seedMut.isPending}
              className="text-xs h-7 gap-1"
            >
              {seedMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              Restore Presets
            </Button>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading categories...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 flex-1 divide-y md:divide-y-0 md:divide-x overflow-hidden">
            {/* Left Column: Parent Categories */}
            <div className="flex flex-col h-[55vh] overflow-y-auto p-3 space-y-2 bg-muted/5">
              <div className="flex items-center justify-between pb-1 border-b">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Main Categories ({categories.length})
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetForm();
                    setIsAddingCategory(true);
                  }}
                  className="h-6 text-xs text-primary gap-1 px-2"
                >
                  <Plus className="h-3 w-3" /> New Head
                </Button>
              </div>

              {isAddingCategory && (
                <div className="p-2.5 rounded border border-primary/40 bg-card space-y-2 text-xs">
                  <div className="font-bold text-primary">Add Main Category</div>
                  <Input
                    placeholder="Category Name (e.g. Site Overheads)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-7 text-xs"
                    autoFocus
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Nepali Name (ऐच्छिक)"
                      value={nameNp}
                      onChange={(e) => setNameNp(e.target.value)}
                      className="h-7 text-xs"
                    />
                    <Input
                      placeholder="Code (e.g. OVH)"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="h-7 text-xs uppercase"
                    />
                  </div>
                  <div className="flex justify-end gap-1.5 pt-1">
                    <Button variant="ghost" size="sm" onClick={resetForm} className="h-6 text-xs px-2">
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleCreate()}
                      disabled={createMut.isPending || !name}
                      className="h-6 text-xs px-3"
                    >
                      {createMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                {categories.map((cat) => {
                  const isSelected = selectedParent?.id === cat.id;
                  return (
                    <div
                      key={cat.id}
                      onClick={() => {
                        setSelectedParentId(cat.id);
                        resetForm();
                      }}
                      className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors border text-xs ${
                        isSelected
                          ? "bg-primary/10 border-primary text-primary font-bold shadow-sm"
                          : "hover:bg-muted/50 border-transparent text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {cat.code && (
                          <Badge variant="outline" className="font-mono text-[10px] px-1 py-0 h-4">
                            {cat.code}
                          </Badge>
                        )}
                        <span className="truncate">{cat.name}</span>
                        {cat.nameNp && (
                          <span className="text-[10px] text-muted-foreground font-normal truncate">
                            ({cat.nameNp})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          {cat.children?.length || 0} sub
                        </Badge>
                        {!cat.isSystem && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete category "${cat.name}"?`)) {
                                deleteMut.mutate({ id: cat.id, projectId });
                              }
                            }}
                            className="h-5 w-5 text-muted-foreground hover:text-red-500"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Subcategories for Selected Head */}
            <div className="flex flex-col h-[55vh] overflow-y-auto p-3 space-y-2 bg-card">
              {selectedParent ? (
                <>
                  <div className="flex items-center justify-between pb-1 border-b">
                    <div>
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <span className="text-primary">{selectedParent.name}</span>
                        <span className="text-muted-foreground font-normal">→ Subcategories</span>
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        resetForm();
                        setIsAddingSub(true);
                      }}
                      className="h-6 text-xs text-primary gap-1 px-2 border-primary/30"
                    >
                      <Plus className="h-3 w-3" /> Add Subcategory
                    </Button>
                  </div>

                  {isAddingSub && (
                    <div className="p-2.5 rounded border border-primary/40 bg-muted/20 space-y-2 text-xs">
                      <div className="font-bold text-primary">
                        New Subcategory under {selectedParent.name}
                      </div>
                      <Input
                        placeholder="Subcategory Name (e.g. Food / Mess / Khaja)"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="h-7 text-xs bg-background"
                        autoFocus
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="Nepali Name (e.g. खाजा खर्च)"
                          value={nameNp}
                          onChange={(e) => setNameNp(e.target.value)}
                          className="h-7 text-xs bg-background"
                        />
                        <Input
                          placeholder="Code (e.g. OVH-FOD)"
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          className="h-7 text-xs bg-background uppercase"
                        />
                      </div>
                      <div className="flex justify-end gap-1.5 pt-1">
                        <Button variant="ghost" size="sm" onClick={resetForm} className="h-6 text-xs px-2">
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleCreate(selectedParent.id)}
                          disabled={createMut.isPending || !name}
                          className="h-6 text-xs px-3"
                        >
                          {createMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save Subcategory"}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    {selectedParent.children && selectedParent.children.length > 0 ? (
                      selectedParent.children.map((sub) => (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between p-2 rounded hover:bg-muted/30 border border-border/50 text-xs transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate">
                            {sub.code ? (
                              <Badge variant="outline" className="font-mono text-[9px] px-1 py-0 h-4 bg-muted/40">
                                {sub.code}
                              </Badge>
                            ) : (
                              <span className="h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
                            )}
                            <span className="font-medium text-foreground">{sub.name}</span>
                            {sub.nameNp && (
                              <span className="text-[10px] text-muted-foreground font-normal">
                                ({sub.nameNp})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {!sub.isSystem && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (confirm(`Delete subcategory "${sub.name}"?`)) {
                                    deleteMut.mutate({ id: sub.id, projectId });
                                  }
                                }}
                                className="h-5 w-5 text-muted-foreground hover:text-red-500"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No subcategories defined for {selectedParent.name}. Click "+ Add Subcategory" above.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Select a parent category from the left to view subcategories.
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="p-3 border-t bg-muted/10 flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>Categories sync seamlessly with TallyPrime Cost Centers and Swastik Sub-Ledgers.</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-7 text-xs px-4">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
