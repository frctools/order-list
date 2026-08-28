import { defineEventHandler } from "h3";
import { requireOrganizationContext } from "../../utils/session";
import { listPaymentMethods } from "../../utils/order-service";

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireOrganizationContext(event);
  const methods = await listPaymentMethods(organizationId);
  return { methods };
});
