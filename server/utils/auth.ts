import { betterAuth } from "better-auth";
import { useDB } from "./db";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { Resend } from "resend";
// @ts-expect-error Vue-Email SFC has no type declaration in the server project
import InviteEmail from "./InviteEmail.vue";
import { render } from "@vue-email/render";
import { APIError } from "better-auth/api";
import { isSignUpAllowed, SIGNUP_CLOSED_MESSAGE } from "./signup-gate";
import * as schema from "./auth-schema";
import { EMAIL_FROM_INVITES, SITE_URL } from "./site";

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
    experimental: {
      joins: true,
    },

    baseUrl: getRequestURL(useEvent()).origin,
    plugins: [
      organization({
        async sendInvitationEmail(data) {
          const resend = new Resend(process.env.RESEND_KEY);

          const inviteLink = `${
            import.meta.dev ? "http://localhost:3000" : SITE_URL
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
            from: EMAIL_FROM_INVITES,
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
    // Signups are closed: only an invited address (or the very first account on
    // a fresh instance) may create a user. Enforced here rather than on the
    // signup page because Better Auth owns the route the form posts to.
    databaseHooks: {
      user: {
        create: {
          before: async (newUser) => {
            if (await isSignUpAllowed(newUser.email)) return;
            throw new APIError("FORBIDDEN", {
              message: SIGNUP_CLOSED_MESSAGE,
            });
          },
        },
      },
    },
    session: {
    },
  });
