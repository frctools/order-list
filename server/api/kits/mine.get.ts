import { defineEventHandler } from "h3";
import { listOwnedKits } from "../../utils/kit-service";
import { requireOrganizationContext } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const { organizationId, user } = await requireOrganizationContext(event);

  const kits = await listOwnedKits({
    organizationId,
    userId: user.id,
  });

  return { kits };
});
