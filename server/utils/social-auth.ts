// Social sign-in is optional, the same way DigiKey and Meilisearch are: with no
// credentials set the provider is simply absent, rather than the app failing to
// start or offering a button that cannot work. That keeps a dev machine with a
// bare .env working, and lets production turn Google on by adding two variables
// and reloading.
//
// Worth knowing: enabling this does NOT open the instance up. Better Auth
// creates an OAuth user through the same createWithHooks("user") path as an
// email signup, so the invitation gate in auth.ts runs for a Google sign-in
// too, and an uninvited Google account is refused exactly like an uninvited
// email address.

export interface SocialProviderInfo {
  /** Matches the id Better Auth's client expects in signIn.social(). */
  id: "google";
  label: string;
  icon: string;
}

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

export function googleCredentials(): GoogleCredentials | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** What the auth pages should offer. Derived from the same env as the config. */
export function configuredSocialProviders(): SocialProviderInfo[] {
  const providers: SocialProviderInfo[] = [];
  if (googleCredentials()) {
    providers.push({
      id: "google",
      label: "Continue with Google",
      icon: "i-simple-icons-google"
    });
  }
  return providers;
}
