import * as Sentry from "@sentry/nuxt";

Sentry.init({
  // If set up, you can use your runtime config here
  // dsn: useRuntimeConfig().public.sentry.dsn,
  dsn: "https://11e10022f5a1c5eacdddea8352abe520@o4510624012173312.ingest.us.sentry.io/4510624013746176",
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
  enableLogs: true,
  sendDefaultPii: true,
  debug: false,
});
