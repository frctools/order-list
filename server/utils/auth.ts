import { betterAuth } from "better-auth";
import { useDB } from "./db";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt, organization } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import { mcp } from "@better-auth/mcp";
import { Resend } from "resend";
import InviteEmail from "./InviteEmail.vue";
import ResetPasswordEmail from "./ResetPasswordEmail.vue";
import { render } from "@vue-email/render";
import * as schema from "./auth-schema";
import { asc, eq } from "drizzle-orm";

export const useAuth = () => {
  const origin = getRequestURL(useEvent()).origin;

  return betterAuth({
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
    advanced: {
      database: {
        joins: true,
      },
    },

    baseURL: origin,
    plugins: [
      jwt(),
      apiKey({
        // Keys are scoped to a team instead of an individual member, so they
        // remain usable when the person who created one leaves the team.
        configId: "organization",
        references: "organization",
        defaultPrefix: "ordr_",
        requireName: true,
        rateLimit: {
          enabled: true,
          maxRequests: 1_000,
          timeWindow: 1000 * 60 * 60 * 24,
        },
      }),
      mcp({
        loginPage: "/auth/login",
        consentPage: "/oauth/consent",
        resource: `${origin}/mcp`,
        scopes: ["openid", "profile", "email", "offline_access", "orders:read"],
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
      }),
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
      async sendResetPassword({ user, url }) {
        const resend = new Resend(process.env.RESEND_KEY);
        const props = {
          userName: user.name,
          resetLink: url,
        };
        const html = await render(ResetPasswordEmail, props, {
          pretty: true,
        });
        const text = await render(ResetPasswordEmail, props, {
          plainText: true,
        });

        const { error } = await resend.emails.send({
          from: "hello@orders.frctools.com",
          to: user.email,
          subject: "Reset your FRCTools Orders password",
          html,
          text,
        });

        if (error) {
          throw new Error(`Failed to send password reset email: ${error.message}`);
        }
      },
    },
    session: {
    },
    databaseHooks: {
      session: {
        create: {
          // better-auth creates sessions with no active organization, so on a
          // fresh login every org-scoped API route 400s until the client calls
          // setActive. Seed it here: prefer the org remembered in the
          // `activeOrganizationId` cookie (if still a member), else the oldest
          // membership.
          before: async (session) => {
            if ((session as { activeOrganizationId?: string | null }).activeOrganizationId) {
              return;
            }
            const memberships = await useDB()
              .select({ organizationId: schema.member.organizationId })
              .from(schema.member)
              .where(eq(schema.member.userId, session.userId))
              .orderBy(asc(schema.member.createdAt));
            if (!memberships.length) return;

            let remembered: string | undefined;
            try {
              remembered = getCookie(useEvent(), "activeOrganizationId");
            } catch {
              // No request context (e.g. session created outside a request).
            }
            const activeOrganizationId =
              memberships.find((m) => m.organizationId === remembered)
                ?.organizationId ?? memberships[0]!.organizationId;

            return { data: { ...session, activeOrganizationId } };
          },
        },
      },
    },
  });
};
