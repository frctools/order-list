import { betterAuth } from "better-auth";
import { useDB } from "./db";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { Resend } from "resend";
// @ts-expect-error Vue-Email SFC has no type declaration in the server project
import InviteEmail from "./InviteEmail.vue";
import { render } from "@vue-email/render";
import * as schema from "./auth-schema";

export const useAuth = () =>
  betterAuth({
    /* logger: {
      level: "debug",
      log: (level, message, ...args) => {
        console.log(`[better-auth] [${level}] ${message}`, ...args);
      },
    }, */
    database: drizzleAdapter(useDB(), {
      provider: "pg",
      schema: { ...schema, },
    }),
    /* secondaryStorage: !import.meta.dev ?{
      get: (key) =>
        (useEvent().context.cloudflare.env.KV as KVNamespace).get(
          `_auth:${key}`,
        ),
      set: (key, value, ttl) => {
        return (useEvent().context.cloudflare.env.KV as KVNamespace).put(
          `_auth:${key}`,
          value,
          { expirationTtl: ttl },
        );
      },
      delete: (key) =>
        (useEvent().context.cloudflare.env.KV as KVNamespace).delete(
          `_auth:${key}`,
        ),
    }: undefined, */
    experimental: {
      joins: true,
    },

    baseUrl: getRequestURL(useEvent()).origin,
    plugins: [
      organization({
        async sendInvitationEmail(data) {
          const resend = new Resend(process.env.RESEND_KEY);

          const inviteLink = `${
            import.meta.dev
              ? "http://localhost:3000"
              : "https://orders.frctools.com"
          }/accept-invitation/${data.id}`;
          const props = {
            organizationName: data.organization.name,
            inviterName: data.inviter.user.name,
            inviteLink: inviteLink,
          };
          const html = await render(InviteEmail, props, {
            pretty: true,
          });
          const text = await render(InviteEmail, props, { plainText: true });
          await resend.emails.send({
            from: "hello@orders.frctools.com",
            to: data.email,
            subject: `You're invited to join ${data.organization.name}`,
            html,
            text,
          });
        },
      }),
    ],
    emailAndPassword: {
      enabled: true,
    },
    session: {
    },
  });
