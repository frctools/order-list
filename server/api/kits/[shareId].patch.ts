import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requireOrganizationContext } from "../../utils/session";
import { updateKitSchema, updateOwnedKit } from "../../utils/kit-service";

export default defineEventHandler(async (event) => {
  const shareId = getRouterParam(event, "shareId");
  if (!shareId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Kit share ID is required",
    });
  }

  const { organizationId, user } = await requireOrganizationContext(event);
  const rawBody = await readBody(event);
  const parsed = updateKitSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        parsed.error.flatten().formErrors.join(", ") || "Invalid payload",
      data: parsed.error.flatten().fieldErrors,
    });
  }

  const kit = await updateOwnedKit(shareId, parsed.data, {
    organizationId,
    userId: user.id,
  });

  if (!kit) {
    throw createError({
      statusCode: 404,
      statusMessage: "Kit not found",
    });
  }

  return {
    kit,
    sharePath: `/kits/${kit.shareId}`,
  };
});
