import type { Fetcher } from "@cloudflare/workers-types";

export default defineEventHandler(async (event) => {
  const fetchFn = !import.meta.dev
    ? (event.context.cloudflare.env.VPC_SERVICE as Fetcher).fetch.bind(
        event.context.cloudflare.env.VPC_SERVICE,
      )
    : fetch;
  const url = getQuery(event).url as string;
  if (!url) {
    throw createError({ statusCode: 400, statusMessage: "URL is required" });
  }
  const fetchUrl = new URL(
    !import.meta.dev ? "http://localhost:3434" : "http://localhost:3001",
  );
  fetchUrl.searchParams.set("url", url);

  return fetchFn(fetchUrl.toString(), {
    headers: Object.fromEntries(
      Object.entries(getHeaders(event)).filter(([_, v]) => v !== undefined),
    ) as Record<string, string>,
  });
});
