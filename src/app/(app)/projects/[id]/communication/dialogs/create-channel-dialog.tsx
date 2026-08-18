"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Users, Hash, Megaphone, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function CreateChannelDialog({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("group");
  const [description, setDescription] = useState("");
  const createMut = trpc.chat.createChannel.useMutation({
    onSuccess: () => { toast.success("Channel created"); onDone(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>New Channel</DialogTitle><DialogDescription>Create a communication channel for your team.</DialogDescription></DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5"><Label className="text-xs">Channel Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Civil Team, Site Coordination" className="h-9 text-sm" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={setType}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="group"><Users className="inline h-3 w-3 mr-1" /> Group (custom members)</SelectItem>
            <SelectItem value="public"><Hash className="inline h-3 w-3 mr-1" /> Public (all project members)</SelectItem>
            <SelectItem value="project_order"><Megaphone className="inline h-3 w-3 mr-1" /> Project Order (PM only, broadcast)</SelectItem>
          </SelectContent></Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Description (optional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this channel about?" className="h-9 text-sm" /></div>
        {type === "public" && <p className="text-[10px] text-muted-foreground italic">All project members will be automatically added to this channel.</p>}
        {type === "project_order" && <p className="text-[10px] text-amber-600 italic">Only Project Managers and Coordinators can post. All members can read. Email notifications sent on new orders.</p>}
      </div>
      <DialogFooter><Button variant="outline" onClick={onDone}>Cancel</Button><Button onClick={() => createMut.mutate({ projectId, name, type: type as any, description: description || undefined })} disabled={createMut.isPending || !name}>{createMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Create</Button></DialogFooter>
    </DialogContent>
  );
}
