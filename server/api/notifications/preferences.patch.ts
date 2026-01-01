import { defineEventHandler, readBody, createError } from "h3";
import { z } from "zod";
import { emailService } from "../../utils/email-service";
import { requireOrganizationContext } from "../../utils/session";

const updatePreferencesSchema = z.object({
  orderCreated: z.boolean().optional(),
  orderStatusChanged: z.boolean().optional(),
  orderDeleted: z.boolean().optional(),
  dailyDigest: z.boolean().optional(),
  digestTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
});

export default defineEventHandler(async (event) => {
  const { organizationId, user } = await requireOrganizationContext(event);
  const body = await readBody(event);

  const parsed = updatePreferencesSchema.safeParse(body);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid request body",
      data: parsed.error.flatten().fieldErrors,
    });
  }

  const updated = await emailService.updatePreferences(
    user.id,
    organizationId,
    parsed.data,
  );

  if (!updated) {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update notification preferences",
    });
  }

  return updated;
});
