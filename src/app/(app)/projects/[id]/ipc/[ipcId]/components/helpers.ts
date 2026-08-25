export function fmt(n: number, decimals = 2) {
  if (!n) return "0.00";
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function pct(cum: number, contract: number) {
  if (!contract || contract === 0) return "0.00%";
  return `${((cum / contract) * 100).toFixed(2)}%`;
}

export type IpcItem = {
  id: string;
  boqCode: string | null;
  description: string;
  unit: string;
  section: string | null;
  contractQty: number;
  previousQty: number;
  thisQty: number;
  cumQty: number;
  rate: number;
  amount: number;
  sortOrder: number;
};
