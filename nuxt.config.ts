import vue from '@vitejs/plugin-vue'
// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    "@nuxt/eslint",
    "@nuxt/ui",
    "@nuxt/content",
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
    replace: {
      "typeof window": "`undefined`",
    },

    experimental: {
      asyncContext: true,
    },

    rollupConfig: {
      plugins: [vue()],
      external: ["pg-native", "canvas"],
    },
    // Deployed to a DigitalOcean droplet behind Caddy, not Workers. The
    // Cloudflare preset, its wrangler bindings (Hyperdrive, KV, D1,
    // VPC_SERVICE) and the route are gone with it — see git history if any of
    // that is ever wanted back.
    preset: "node-server",
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