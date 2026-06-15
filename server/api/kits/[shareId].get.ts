import { createError, defineEventHandler, getRouterParam } from "h3";
import { getSharedKitByShareId } from "../../utils/kit-service";

export default defineEventHandler(async (event) => {
  const shareId = getRouterParam(event, "shareId");

  if (!shareId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Kit share ID is required",
    });
  }

  const kit = await getSharedKitByShareId(shareId);

  if (!kit) {
    throw createError({
      statusCode: 404,
      statusMessage: "Kit not found",
    });
  }

  return { kit };
});
