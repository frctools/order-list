import { defineEventHandler, readBody, createError } from "h3";
import { requireOrganizationContext } from "../../utils/session";
import { createOrderSchema, createOrder } from "../../utils/order-service";
import { notificationHelpers } from "../../utils/notification-helpers";

export default defineEventHandler(async (event) => {
  const { organizationId, user } = await requireOrganizationContext(event);
  const rawBody = await readBody(event);
  const parsed = createOrderSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        parsed.error.flatten().formErrors.join(", ") || "Invalid payload",
      data: parsed.error.flatten().fieldErrors,
    });
  }

  const order = await createOrder(parsed.data, {
    organizationId,
    userId: user.id,
  });

  notificationHelpers
    .notifyOrderCreated(
      organizationId,
      order.id,
      order.partName,
      order.description,
      user.id,
    )
    .catch((err) =>
      console.error("Failed to send order creation notifications:", err),
    );

  return { order };
});
