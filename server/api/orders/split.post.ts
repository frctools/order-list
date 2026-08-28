import { defineEventHandler, readBody, createError } from "h3";
import { z } from "zod";
import { requireOrganizationContext } from "../../utils/session";
import { splitItemsToNewOrder } from "../../utils/order-service";

const splitSchema = z.object({
  orderId: z.string().min(1),
  itemIds: z.array(z.string().min(1)).min(1, "Select at least one item"),
});

export default defineEventHandler(async (event) => {
  const { organizationId, user } = await requireOrganizationContext(event);
  const parsed = splitSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        parsed.error.flatten().formErrors.join(", ") || "Invalid payload",
      data: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    // Moves the selected items into a new pending order for the same vendor.
    const result = await splitItemsToNewOrder(
      parsed.data.orderId,
      parsed.data.itemIds,
      { organizationId, userId: user.id },
    );
    return result;
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }
});
