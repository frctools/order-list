import { defineEventHandler } from "h3";
import { emailService } from "../../utils/email-service";
import { requireOrganizationContext } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const { organizationId, user } = await requireOrganizationContext(event);
  const query = getQuery(event);
  const limit = Math.min(parseInt(query.limit as string) || 20, 100);

  const logs = await emailService.getNotificationLog(
    user.id,
    organizationId,
    limit,
  );

  return {
    logs,
    total: logs.length,
  };
});
