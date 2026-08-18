import { router } from "@/server/trpc";
import { equipmentCoreProcedures } from "./equipment-core";
import { equipmentRentalProcedures } from "./equipment-rental";
import { equipmentVendorProcedures } from "./equipment-vendor";

export const equipmentRouter = router({
  ...equipmentCoreProcedures,
  ...equipmentRentalProcedures,
  ...equipmentVendorProcedures,
});
