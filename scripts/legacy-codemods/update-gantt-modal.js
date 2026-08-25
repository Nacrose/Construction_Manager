const fs = require('fs');
let content = fs.readFileSync('src/app/(app)/projects/[id]/gantt/page.tsx', 'utf8');

// 1. Add Imports
if (!content.includes('DialogContent')) {
  content = content.replace(
    'import {',
    'import {\n  Dialog,\n  DialogContent,\n  DialogHeader,\n  DialogTitle,\n  DialogTrigger,\n  DialogFooter,\n} from "@/components/ui/dialog";\nimport {\n  Switch\n} from "@/components/ui/switch";\nimport {'
  );
}
if (!content.includes('Copy')) {
  content = content.replace(
    'import {',
    'import { Copy } from "lucide-react";\nimport {'
  );
}

// 2. Add Modal State and Handlers in GanttPage
content = content.replace(
  'const { data: librariesData } = trpc.rateProfile.list.useQuery({ projectId: id });',
  `const { data: librariesData } = trpc.rateProfile.list.useQuery({ projectId: id });
  
  const [createVersionOpen, setCreateVersionOpen] = useState(false);
  const [newVersionName, setNewVersionName] = useState("");
  const [newVersionIsDefault, setNewVersionIsDefault] = useState(false);
  const [cloneVersionId, setCloneVersionId] = useState<string>("none");

  const createVersionMutation = trpc.gantt.createVersion.useMutation({
    onSuccess: (res) => {
      utils.gantt.listVersions.invalidate({ projectId: id });
      setSelectedVersionId(res.version.id);
      setCreateVersionOpen(false);
      setNewVersionName("");
      toast.success("Version created successfully");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreateVersion = () => {
    if (!newVersionName) {
      toast.error("Please enter a version name");
      return;
    }
    createVersionMutation.mutate({
      projectId: id,
      name: newVersionName,
      isDefault: newVersionIsDefault,
      cloneFromVersionId: cloneVersionId !== "none" ? cloneVersionId : undefined,
    });
  };`
);

// 3. Inject the Create Version Button and Modal in the UI
const modalUI = `
        <div className="flex items-center gap-3">
           <Dialog open={createVersionOpen} onOpenChange={setCreateVersionOpen}>
             <DialogTrigger asChild>
               <Button variant="outline" size="icon" title="Create New Version">
                 <Copy className="h-4 w-4" />
               </Button>
             </DialogTrigger>
             <DialogContent>
               <DialogHeader>
                 <DialogTitle>Create New Schedule Version</DialogTitle>
               </DialogHeader>
               <div className="space-y-4 py-4">
                 <div className="space-y-2">
                   <Label>Version Name</Label>
                   <Input 
                     placeholder="e.g. Revised Baseline" 
                     value={newVersionName} 
                     onChange={(e) => setNewVersionName(e.target.value)} 
                   />
                 </div>
                 <div className="space-y-2">
                   <Label>Clone tasks from existing version?</Label>
                   <Select value={cloneVersionId} onValueChange={setCloneVersionId}>
                     <SelectTrigger><SelectValue placeholder="Do not clone" /></SelectTrigger>
                     <SelectContent>
                        <SelectItem value="none">Do not clone (Start fresh)</SelectItem>
                        {versionsData?.versions.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                     </SelectContent>
                   </Select>
                   <p className="text-xs text-muted-foreground">This will copy all tasks and BOQ links to the new version.</p>
                 </div>
                 <div className="flex items-center gap-2 pt-2">
                   <Switch checked={newVersionIsDefault} onCheckedChange={setNewVersionIsDefault} />
                   <Label>Set as default active version</Label>
                 </div>
               </div>
               <DialogFooter>
                 <Button variant="outline" onClick={() => setCreateVersionOpen(false)}>Cancel</Button>
                 <Button 
                   onClick={handleCreateVersion} 
                   disabled={createVersionMutation.isPending || !newVersionName}
                 >
                   {createVersionMutation.isPending ? "Creating..." : "Create Version"}
                 </Button>
               </DialogFooter>
             </DialogContent>
           </Dialog>

           <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>`;

content = content.replace(
  '<div className="flex items-center gap-3">\n           <Select value={selectedVersionId}',
  modalUI
);

fs.writeFileSync('src/app/(app)/projects/[id]/gantt/page.tsx', content);
