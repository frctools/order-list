import { defineEventHandler, createError } from "h3";
import { requireOrganizationContext } from "../../../../utils/session";
import { deleteLineItem } from "../../../../utils/order-service";

export default defineEventHandler(async (event) => {
  const { organizationId, user } = await requireOrganizationContext(event);
  const orderId = event.context.params?.id;
  const itemId = event.context.params?.itemId;
  if (!orderId || !itemId) {
    throw createError({ statusCode: 400, statusMessage: "Missing id" });
  }

  try {
    // `order` is null when removing the last item deletes the whole order.
    const { order } = await deleteLineItem(orderId, itemId, {
      organizationId,
      userId: user.id,
    });
    return { success: true, order };
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }
});
