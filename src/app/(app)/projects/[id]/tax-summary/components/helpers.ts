import { format } from "date-fns";

export function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  const d = new Date(parseInt(y), parseInt(mo) - 1, 1);
  return format(d, "MMM yyyy");
}
