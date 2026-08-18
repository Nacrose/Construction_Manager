"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Settings, MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function ManageDistrictsDialog({
  districts,
  open,
  onOpenChange,
  onSuccess,
}: {
  catalogId: string;
  districts: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (updatedDistricts: string[]) => void;
}) {
  const [districtList, setDistrictList] = useState<string[]>(districts);
  const [newDistrict, setNewDistrict] = useState("");

  const handleAddDistrict = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newDistrict.trim();
    if (!trimmed) return;
    if (districtList.map((d) => d.toLowerCase()).includes(trimmed.toLowerCase())) {
      toast.error(`"${trimmed}" already exists in districts list.`);
      return;
    }
    setDistrictList([...districtList, trimmed]);
    setNewDistrict("");
  };

  const handleRemoveDistrict = (districtToRemove: string) => {
    if (districtList.length <= 1) {
      toast.error("A catalog must have at least one active district location.");
      return;
    }
    setDistrictList(districtList.filter((d) => d !== districtToRemove));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Settings className="h-5 w-5 text-amber-500" />
            Manage Catalog Districts & Locations
          </DialogTitle>
          <DialogDescription className="text-xs">
            Add or remove district locations to compare rates across regions in this catalog.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <form onSubmit={handleAddDistrict} className="flex gap-2">
            <Input
              value={newDistrict}
              onChange={(e) => setNewDistrict(e.target.value)}
              placeholder="Add New District / Location (e.g. Pokhara, Jhapa)"
              className="h-8 text-xs"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!newDistrict.trim()}
              className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white shrink-0"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </form>

          <div className="space-y-1.5 max-h-56 overflow-auto pr-1">
            <Label className="text-xs font-semibold text-muted-foreground">
              Active Locations ({districtList.length}):
            </Label>
            <div className="space-y-1">
              {districtList.map((d) => (
                <div
                  key={d}
                  className="flex items-center justify-between p-2 rounded-lg border bg-card text-xs"
                >
                  <span className="font-medium flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-amber-500" /> {d}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => handleRemoveDistrict(d)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            size="sm"
            onClick={() => onSuccess(districtList)}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
          >
            Save Location Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
