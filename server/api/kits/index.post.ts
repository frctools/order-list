import { createError, defineEventHandler, readBody } from "h3";
import { createKit, createKitSchema } from "../../utils/kit-service";
import { requireOrganizationContext } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const { organizationId, user } = await requireOrganizationContext(event);
  const rawBody = await readBody(event);
  const parsed = createKitSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        parsed.error.flatten().formErrors.join(", ") || "Invalid payload",
      data: parsed.error.flatten().fieldErrors,
    });
  }

  const kit = await createKit(parsed.data, {
    organizationId,
    userId: user.id,
  });

  return {
    kit,
    sharePath: `/kits/${kit.shareId}`,
  };
});
