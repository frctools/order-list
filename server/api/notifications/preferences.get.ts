import { defineEventHandler } from "h3";
import { emailService } from "../../utils/email-service";
import { requireOrganizationContext } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const { organizationId, user } = await requireOrganizationContext(event);

  const prefs = await emailService.getOrCreatePreferences(
    user.id,
    organizationId,
  );

  return prefs;
});
