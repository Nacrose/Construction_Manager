import { router } from "@/server/trpc";
import { materialCrudProcedures } from "./material-crud";
import { materialTransactionProcedures } from "./material-transaction";
import { materialReconciliationProcedures } from "./material-reconciliation";

export const materialRouter = router({
  ...materialCrudProcedures,
  ...materialTransactionProcedures,
  ...materialReconciliationProcedures,
});
