import { createMcpHandler } from "agents/mcp/server";
import { requireMcpAuth } from "@better-auth/mcp";
import { createOrderrMcpServer } from "../utils/mcp";
import { useAuth } from "../utils/auth";

export default defineEventHandler(async (event) => {
  const request = toWebRequest(event);
  const origin = new URL(request.url).origin;
  const auth = useAuth();

  const handleProtectedRequest = requireMcpAuth(
    auth,
    async (protectedRequest, claims) => {
      if (!claims.sub) {
        return new Response("Access token is missing a subject", { status: 401 });
      }

      const handler = createMcpHandler(
        () => createOrderrMcpServer(claims.sub!),
        {
          route: "/mcp",
          // Keep compatibility with stateless clients on the published 2025 MCP
          // protocol while using the SDK's current 2026 protocol internally.
          legacy: "stateless",
          allowedHostnames: [new URL(origin).hostname],
        },
      );

      return handler.fetch(protectedRequest);
    },
    {
      resource: `${origin}/mcp`,
      requiredScopes: ["orders:read"],
    },
  );

  return handleProtectedRequest(request);
});
