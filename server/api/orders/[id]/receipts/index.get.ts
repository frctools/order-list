import { defineEventHandler, createError } from "h3";
import { requireOrganizationContext } from "../../../../utils/session";
import { listReceipts } from "../../../../utils/receipt-service";

export default defineEventHandler(async (event) => {
  const { organizationId, user } = await requireOrganizationContext(event);
  const orderId = event.context.params?.id;
  if (!orderId) {
    throw createError({ statusCode: 400, statusMessage: "Order id is required" });
  }

  const receipts = await listReceipts({ organizationId, userId: user.id }, orderId);
  if (!receipts) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  return { receipts };
});
