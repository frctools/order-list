import { defineEventHandler } from "h3";
import { configuredSocialProviders } from "../utils/social-auth";

/**
 * Which social sign-in buttons the auth pages should render. Cosmetic only --
 * the credentials decide what actually works, and the invitation gate still
 * runs for whatever is offered.
 */
export default defineEventHandler(() => {
  return { providers: configuredSocialProviders() };
});
