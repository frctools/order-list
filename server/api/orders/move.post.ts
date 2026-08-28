import { defineEventHandler, readBody, createError } from "h3";
import { z } from "zod";
import { requireOrganizationContext } from "../../utils/session";
import { moveItemsToOrder } from "../../utils/order-service";

const moveSchema = z.object({
  targetOrderId: z.string().min(1),
  itemIds: z.array(z.string().min(1)).min(1, "Select at least one part"),
});

export default defineEventHandler(async (event) => {
  const { organizationId, user } = await requireOrganizationContext(event);
  const parsed = moveSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        parsed.error.flatten().formErrors.join(", ") || "Invalid payload",
      data: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    // Moves the parts into the target open order, joining them together.
    return await moveItemsToOrder(parsed.data.itemIds, parsed.data.targetOrderId, {
      organizationId,
      userId: user.id,
    });
  } catch (err) {
    throw createError({
      statusCode: 400,
      statusMessage:
        err instanceof Error ? err.message : "Could not move parts",
    });
  }
});
