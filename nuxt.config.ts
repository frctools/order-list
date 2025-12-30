import vue from '@vitejs/plugin-vue'
// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    "@nuxt/eslint",
    "@nuxt/ui",
    "@nuxt/content",
    "nitro-cloudflare-dev",
    "@nuxtjs/plausible",
    "@nuxtjs/mdc",
    "@sentry/nuxt/module",
  ],

  devtools: {
    enabled: true,

    timeline: {
      enabled: true,
    },
  },

  app: {
    head: {
      link: [{ rel: "icon", type: "image/x-icon", href: "/logo.svg" }],
    },
  },

  css: ["~/assets/css/main.css"],

  content: {
    build: {
      markdown: {
        toc: {
          searchDepth: 1,
        },
      },
    },
  },

  runtimeConfig: {
    public: {
      sentry: {
        dsn: process.env.NUXT_PUBLIC_SENTRY_DSN!,
      },
    },
    resendKey: "",
    databaseUrl: "",
    betterAuthUrl: "",
    betterAuthSecret: "",
  },

  routeRules: {
    "/": { prerender: true },
  },

  sourcemap: {
    client: "hidden",
  },

  compatibilityDate: "2025-01-15",

  nitro: {
    experimental: {
      asyncContext: true,
    },

    rollupConfig: {
      plugins: [vue()],
      external: ["pg-native", "canvas"],
    },
    preset: "cloudflare-module",
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,

      wrangler: {
        observability: {
          logs: {
            enabled: true,
            head_sampling_rate: 1,
            invocation_logs: true,
            // "persist": true
          },
        },
        // @ts-expect-error nitro types are out of date
        vpc_services: [
          {
            binding: "VPC_SERVICE",
            service_id: "019a94d0-60c0-7fb2-bf4b-7503c5426321",
            remote: true,
          },
        ],
        kv_namespaces: [
          {
            binding: "KV",
            id: "b3ed2d9914954aa59cb27389cbf19ffb",
          },
        ],
        d1_databases: [
          {
            binding: "DB",
            database_name: "content-orders",
            database_id: "12c94989-e82e-41b0-97b5-b8268dcb834f",
          },
        ],
        routes: [
          {
            pattern: "orders.frctools.com",
            custom_domain: true,
          },
        ],
        version_metadata: {
          binding: "CF_VERSION_METADATA",
        },

        compatibility_flags: ["nodejs_compat"],
        hyperdrive: [
          {
            binding: "HYPERDRIVE",
            id: "0e07ebd85b544c199aec73a44885734f",
          },
        ],
      },
    },
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: "never",
        braceStyle: "1tbs",
      },
    },
  },

  fonts: {
    families: [
      {
        name: "Bricolage Grotesque",
        provider: "local",
      },
    ],
  },

  icon: {
    provider: "iconify",
  },

  plausible: {
    // Prevent tracking on localhost
    ignoredHostnames: ["localhost"],
    apiHost: "https://possible.grahamsh.com",
  },

  sentry: {
    org: "frctools",
    project: "frctools-orders",
  },
});