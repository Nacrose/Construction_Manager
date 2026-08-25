const fs = require('fs');

function addTableId(file, id) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('tableId=')) return;
  content = content.replace(/<DataTable/g, `<DataTable tableId="${id}"`);
  fs.writeFileSync(file, content);
}

addTableId('src/app/(app)/projects/[id]/materials/page.tsx', 'materials-table');
addTableId('src/app/(app)/projects/[id]/hr/page.tsx', 'hr-table');
addTableId('src/app/(app)/projects/[id]/equipment/page.tsx', 'equipment-table');
