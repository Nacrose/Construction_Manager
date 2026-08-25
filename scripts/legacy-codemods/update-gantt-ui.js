const fs = require('fs');
let content = fs.readFileSync('src/app/(app)/projects/[id]/gantt/page.tsx', 'utf8');

// 1. Add useState imports if not present
if (!content.includes('useState')) {
  // It's probably already there from React, but just in case
}

// 2. Add state hooks at the top of GanttPage
content = content.replace(
  'const { id } = use(params);',
  'const { id } = use(params);\n  const [selectedVersionId, setSelectedVersionId] = useState<string>("");\n  const [selectedCostLibraryId, setSelectedCostLibraryId] = useState<string>("");\n  const { data: versionsData } = trpc.gantt.listVersions.useQuery({ projectId: id });\n  const { data: librariesData } = trpc.rateProfile.list.useQuery({ projectId: id });'
);

// 3. Update the gantt.list query to use versionId
content = content.replace(
  'const { data, isLoading } = trpc.gantt.list.useQuery({ projectId: id });',
  'const { data, isLoading } = trpc.gantt.list.useQuery({ projectId: id, versionId: selectedVersionId || undefined });'
);

// 4. Inject the Selectors in the toolbar
const selectors = `
        <div className="flex items-center gap-3">
           <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
             <SelectTrigger className="w-[200px]"><SelectValue placeholder="Default Running" /></SelectTrigger>
             <SelectContent>
                <SelectItem value="">Default Running</SelectItem>
                {versionsData?.versions.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
             </SelectContent>
           </Select>

           <Select value={selectedCostLibraryId} onValueChange={setSelectedCostLibraryId}>
             <SelectTrigger className="w-[200px]"><SelectValue placeholder="Standard Cost (Default)" /></SelectTrigger>
             <SelectContent>
                <SelectItem value="">Standard Cost (Default)</SelectItem>
                {librariesData?.rateProfiles.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
             </SelectContent>
           </Select>
        </div>
      </div>
`;
content = content.replace(
  '</div>\n\n      <Tabs defaultValue="schedule"',
  selectors + '\n\n      <Tabs defaultValue="schedule"'
);

// 5. Update TaskRow props
content = content.replace(
  'canWrite: boolean;\n  projectId: string;\n}) {',
  'canWrite: boolean;\n  projectId: string;\n  selectedCostLibraryId?: string;\n}) {'
);
content = content.replace(
  'canWrite={!!canWrite}\n                      projectId={id}\n                    />',
  'canWrite={!!canWrite}\n                      projectId={id}\n                      selectedCostLibraryId={selectedCostLibraryId}\n                    />'
);
content = content.replace(
  'canWrite={canWrite}\n            projectId={projectId}\n          />',
  'canWrite={canWrite}\n            projectId={projectId}\n            selectedCostLibraryId={selectedCostLibraryId}\n          />'
);

// 6. Calculate Dynamic Cost in TaskRow
content = content.replace(
  '// Bar position',
  `
  // Dynamic Cost Calculation
  const displayCost = useMemo(() => {
    if (!task.boqLinks || task.boqLinks.length === 0) return task.plannedValue;
    
    let total = 0;
    for (const link of task.boqLinks) {
      let rate = link.boqItem?.rate || 0; // Default standard rate
      
      // If a specific cost library is selected, try to find a RateAnalysis for it
      if (selectedCostLibraryId && link.boqItem?.rateAnalyses) {
        // @ts-ignore (because typing is complex for the deeply nested include)
        const analysis = link.boqItem.rateAnalyses.find(a => a.libraryId === selectedCostLibraryId);
        if (analysis) {
          rate = analysis.totalRate;
        }
      }
      total += rate * link.quantity;
    }
    return total;
  }, [task, selectedCostLibraryId]);

  // Bar position`
);

// Replace task.plannedValue formatting with displayCost
content = content.replace(
  '<span>{formatCurrency(task.plannedValue)}</span>',
  '<span>{formatCurrency(displayCost)}</span>'
);

fs.writeFileSync('src/app/(app)/projects/[id]/gantt/page.tsx', content);
