import { defineEventHandler, readBody, createError } from "h3";
import { z } from "zod";
import { requireOrganizationContext } from "../../../utils/session";
import { updateOrderDetails } from "../../../utils/order-service";

const emptyToNull = (value: string | null | undefined) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const paymentSchema = z.object({
  type: z.enum(["credit_card", "voucher", "coupon", "other"]),
  label: z.string().trim().min(1, "Label is required"),
  amountCents: z.coerce.number().int().min(0),
});

const detailsSchema = z
  .object({
    trackingCarrier: z
      .union([z.string(), z.null()])
      .optional()
      .transform(emptyToNull),
    trackingNumber: z
      .union([z.string(), z.null()])
      .optional()
      .transform(emptyToNull),
    shippingCents: z
      .union([z.coerce.number().int().min(0), z.literal(""), z.null()])
      .optional()
      .transform((v) =>
        v === undefined ? undefined : typeof v === "number" ? v : null,
      ),
    taxCents: z
      .union([z.coerce.number().int().min(0), z.literal(""), z.null()])
      .optional()
      .transform((v) =>
        v === undefined ? undefined : typeof v === "number" ? v : null,
      ),
    payments: z.array(paymentSchema).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "No updates provided" });

export default defineEventHandler(async (event) => {
  const { organizationId, user } = await requireOrganizationContext(event);
  const orderId = event.context.params?.id;
  if (!orderId) {
    throw createError({ statusCode: 400, statusMessage: "Order id is required" });
  }

  const parsed = detailsSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        parsed.error.flatten().formErrors.join(", ") || "Invalid payload",
      data: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const order = await updateOrderDetails(orderId, parsed.data, {
      organizationId,
      userId: user.id,
    });
    return { order };
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }
});
