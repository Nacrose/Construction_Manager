import { format } from "date-fns";
import { formatNpr } from "@/lib/currency";

export { formatNpr as fmt };

export function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  const d = new Date(parseInt(y), parseInt(mo) - 1, 1);
  return format(d, "MMM yyyy");
}
