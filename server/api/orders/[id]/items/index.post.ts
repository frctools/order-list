import { defineEventHandler, readBody, createError } from "h3";
import { requireOrganizationContext } from "../../../../utils/session";
import { createOrderSchema, addItemToOrder } from "../../../../utils/order-service";

export default defineEventHandler(async (event) => {
  const { organizationId, user } = await requireOrganizationContext(event);
  const orderId = event.context.params?.id;
  if (!orderId) {
    throw createError({ statusCode: 400, statusMessage: "Order id is required" });
  }

  // vendorId in the payload is ignored — the item inherits the order's vendor.
  const parsed = createOrderSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        parsed.error.flatten().formErrors.join(", ") || "Invalid payload",
      data: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const order = await addItemToOrder(orderId, parsed.data, {
      organizationId,
      userId: user.id,
    });
    return { order };
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }
});
