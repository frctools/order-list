import { defineEventHandler, readBody, createError } from "h3";
import { z } from "zod";
import { requireOrganizationContext } from "../../../../utils/session";
import { updateLineItem, type UpdateLineItemInput } from "../../../../utils/order-service";

const emptyToNull = (value: string | undefined) => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const updateItemSchema = z
  .object({
    partName: z.string().min(1).optional(),
    description: z.string().optional().transform(emptyToNull),
    quantity: z.coerce.number().int().min(1).optional(),
    unitPriceCents: z
      .union([z.coerce.number().int().min(0), z.literal(""), z.null()])
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        if (typeof value === "number") return value;
        return null;
      }),
    variantId: z.string().optional().transform(emptyToNull),
    variantTitle: z.string().optional().transform(emptyToNull),
    externalUrl: z
      .string()
      .trim()
      .url("Enter a valid URL")
      .optional()
      .or(z.literal(""))
      .or(z.null())
      .transform((value) => {
        if (value === undefined) return undefined;
        return value ? value : null;
      }),
    tagIds: z.array(z.string()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No updates provided",
  });

export default defineEventHandler(async (event) => {
  const { organizationId, user } = await requireOrganizationContext(event);
  const orderId = event.context.params?.id;
  const itemId = event.context.params?.itemId;
  if (!orderId || !itemId) {
    throw createError({ statusCode: 400, statusMessage: "Missing id" });
  }

  const parsed = updateItemSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        parsed.error.flatten().formErrors.join(", ") || "Invalid payload",
      data: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const order = await updateLineItem(
      orderId,
      itemId,
      parsed.data as UpdateLineItemInput,
      { organizationId, userId: user.id },
    );
    return { order };
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }
});
