import { router } from "@/server/trpc";
import { materialCrudProcedures } from "./material-crud";
import { materialTransactionProcedures } from "./material-transaction";
import { materialReconciliationProcedures } from "./material-reconciliation";
import { materialIngredientsProcedures } from "./material-ingredients";

export const materialRouter = router({
  ...materialCrudProcedures,
  ...materialTransactionProcedures,
  ...materialReconciliationProcedures,
  ...materialIngredientsProcedures,
});
