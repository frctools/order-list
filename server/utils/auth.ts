import { betterAuth } from "better-auth";
import { useDB } from "./db";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { Resend } from "resend";
// Vue-Email SFC. vue-tsc gives these real types by pulling the SFC into the
// program, but only where its Vue language plugin is active -- without it the
// import resolves to nothing. The asserting form of this directive is reported
// as unused wherever the SFC does resolve, so use the non-asserting one.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import InviteEmail from "./InviteEmail.vue";
import { render } from "@vue-email/render";
import { APIError } from "better-auth/api";
import { isSignUpAllowed, SIGNUP_CLOSED_MESSAGE } from "./signup-gate";
import { googleCredentials } from "./social-auth";
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
    // Absent unless both env vars are set, so a machine without credentials
    // behaves exactly as before rather than offering a button that 500s.
    socialProviders: googleCredentials()
      ? { google: googleCredentials()! }
      : {},
    account: {
      accountLinking: {
        enabled: true,
        // Google verifies the address it hands over, so a Google sign-in on an
        // address that already has a password account links to that account
        // rather than colliding with it. Without this, the owner who signed up
        // with a password could not later use Google on the same address.
        trustedProviders: ["google"],
      },
    },
    // Signups are closed: only an invited address (or the very first account on
    // a fresh instance) may create a user. Enforced here rather than on the
    // signup page because Better Auth owns the route the form posts to.
    //
    // This covers social sign-in as well: createOAuthUser goes through the same
    // createWithHooks("user") path, so a Google account with no invitation is
    // refused here just like an email signup would be.
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
