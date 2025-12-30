import { sentryCloudflareNitroPlugin } from "@sentry/nuxt/module/plugins";

export default defineNitroPlugin(
  sentryCloudflareNitroPlugin({
    dsn: useRuntimeConfig().public.sentry.dsn,
    tracesSampleRate: 1.0,
    enableLogs: true,
    sendDefaultPii: true,
  }),
);
