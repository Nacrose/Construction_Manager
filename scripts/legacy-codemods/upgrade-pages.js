const fs = require('fs');
const path = require('path');

const files = [
  "src/app/(app)/projects/[id]/materials/page.tsx",
  "src/app/(app)/projects/[id]/boq/page.tsx",
  "src/app/(app)/projects/[id]/drawings/page.tsx",
  "src/app/(app)/projects/[id]/subcontractors/page.tsx",
  "src/app/(app)/projects/[id]/rfis/page.tsx",
  "src/app/(app)/projects/[id]/gantt/page.tsx",
  "src/app/(app)/projects/[id]/daily-reports/page.tsx",
  "src/app/(app)/projects/[id]/hr/page.tsx",
  "src/app/(app)/projects/[id]/ipc/page.tsx",
  "src/app/(app)/projects/[id]/documents/page.tsx",
  "src/app/(app)/projects/[id]/daily-program/page.tsx",
  "src/app/(app)/projects/[id]/equipment/page.tsx"
];

for (const file of files) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) continue;

  let content = fs.readFileSync(p, 'utf8');
  
  if (!content.includes('AnimatedPage')) {
    // Inject import
    content = content.replace(
      'export default function',
      'import { AnimatedPage } from "@/components/ui/animated-page";\n\nexport default function'
    );
    
    // Replace outermost div
    content = content.replace(
      /<div className="space-y-6">/,
      '<AnimatedPage className="space-y-6 pb-8">'
    );
    
    // Replace the closing div at the very end of the file/component
    // We'll find the last </div> before the final }); or }
    const lastDivIndex = content.lastIndexOf('</div>\n  );\n}');
    if (lastDivIndex !== -1) {
      content = content.slice(0, lastDivIndex) + '</AnimatedPage>\n  );\n}' + content.slice(lastDivIndex + 14);
    } else {
        const altLastDivIndex = content.lastIndexOf('</div>\n    )\n}');
        if (altLastDivIndex !== -1) {
            content = content.slice(0, altLastDivIndex) + '</AnimatedPage>\n    )\n}' + content.slice(altLastDivIndex + 14);
        } else {
            console.log(`Could not find closing div in ${file}`);
        }
    }

    fs.writeFileSync(p, content);
    console.log(`Upgraded ${file}`);
  }
}
