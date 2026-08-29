import { defineEventHandler, createError } from "h3";
import { requireOrganizationContext } from "../../../../utils/session";
import { deleteReceipt } from "../../../../utils/receipt-service";
import { getOrder } from "../../../../utils/order-service";

export default defineEventHandler(async (event) => {
  const { organizationId, user } = await requireOrganizationContext(event);
  const orderId = event.context.params?.id;
  const receiptId = event.context.params?.receiptId;
  if (!orderId || !receiptId) {
    throw createError({ statusCode: 400, statusMessage: "Missing id" });
  }

  const removed = await deleteReceipt(
    { organizationId, userId: user.id },
    orderId,
    receiptId
  );
  if (!removed) {
    throw createError({ statusCode: 404, statusMessage: "Receipt not found" });
  }

  // The dashboard patches its local order state from mutation responses, so
  // hand back the whole order rather than just an acknowledgement.
  return { success: true, order: await getOrder(orderId, organizationId) };
});
