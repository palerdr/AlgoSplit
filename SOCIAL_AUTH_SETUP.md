# Google + Apple authentication setup

AlgoSplit supports Google on iOS, Android, and web; native Sign in with Apple on iOS; and Apple OAuth on web. Apple is intentionally not shown on Android. Email/password authentication remains available, and this implementation does not merge account data in the app.

## Callback URLs

Choose the canonical production web origin before enabling the providers. Substitute it below for `https://your-web-app.example` and register these exact callback URLs with Supabase:

| Flow | Web callback | Native callback |
| --- | --- | --- |
| Social sign-in | `https://your-web-app.example/oauth/callback` | `algosplit://oauth/callback` |
| Connected-account link | `https://your-web-app.example/identity/callback` | `algosplit://identity/callback` |

The web app's Vercel fallback already serves these client routes. Do not add them to the `/auth/*` API rewrite.

Use corresponding development URLs such as `http://localhost:8081/oauth/callback` and `http://localhost:8081/identity/callback` only while developing locally. Use a development build for native OAuth so the registered `algosplit` scheme is available.

## App and API environment

The app needs only public Supabase values and the canonical callbacks. Put values like these in the app build environment (see [app/.env.example](app/.env.example)):

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
EXPO_PUBLIC_ALGOSPLIT_OAUTH_WEB_CALLBACK_URL=https://your-web-app.example/oauth/callback
EXPO_PUBLIC_ALGOSPLIT_OAUTH_NATIVE_CALLBACK_URL=algosplit://oauth/callback
EXPO_PUBLIC_ALGOSPLIT_IDENTITY_WEB_CALLBACK_URL=https://your-web-app.example/identity/callback
EXPO_PUBLIC_ALGOSPLIT_IDENTITY_NATIVE_CALLBACK_URL=algosplit://identity/callback
```

Set these backend variables to the same fixed callback values. The identity-link endpoint does not accept a client-supplied redirect target.

```env
FRONTEND_URL=https://your-web-app.example
AUTH_IDENTITY_WEB_CALLBACK_URL=https://your-web-app.example/identity/callback
AUTH_IDENTITY_NATIVE_CALLBACK_URL=algosplit://identity/callback
```

`FRONTEND_URL` must contain the canonical web origin so the backend accepts the web callback. The public OAuth callback values and server-controlled identity callback values must all be in Supabase's allowlist. In production, missing or untrusted backend identity callback configuration makes account linking fail closed.

Never put a Google client secret, Apple private key, Apple client secret, or Supabase secret/service key in Expo public variables, source, logs, or build artifacts. The Supabase URL and publishable key are designed to be public.

## Google

1. In Google Cloud Console, create or select the web OAuth client used by Supabase.
2. Add the production web origin and local development origin to **Authorized JavaScript origins** where Google requires them.
3. Add `https://your-project.supabase.co/auth/v1/callback` as an **Authorized redirect URI**. Use the exact callback URI from the Supabase provider page if the project has a custom auth domain.
4. In Supabase Dashboard → Authentication → Sign In / Providers, enable Google and enter the Google client ID and client secret there.
5. In Supabase Authentication URL configuration, add all four exact production callback URLs above, plus the explicitly supported local-development callbacks.

## Apple

1. In Apple Developer, create/verify the App ID `com.algosplit.app` and enable **Sign in with Apple**.
2. Create a web Services ID for the web OAuth flow. Configure its website and return URL using the Supabase Auth callback (`https://your-project.supabase.co/auth/v1/callback`, or the exact custom Auth domain callback).
3. Create a Sign in with Apple private key and generate the Apple client secret required by Supabase.
4. In Supabase Dashboard → Authentication → Sign In / Providers, enable Apple and configure the Services ID, team ID, key ID, and generated client secret. List the Services ID before the native bundle ID in the Supabase Apple configuration so both web OAuth and iOS native ID-token sign-in work.
5. Add the exact web and native OAuth/link callbacks to Supabase's redirect allowlist.
6. Set a recurring reminder to rotate the Apple web client secret at least every six months. Web Apple OAuth depends on that rotation; native iOS sign-in uses the Apple identity token flow.

## Identity behavior

- New social sign-ins create Supabase Auth users automatically.
- Supabase handles supported automatic identity linking for an existing matching verified email. The app does not perform account/data merges.
- Connected accounts lets a signed-in user attach Google or Apple explicitly. The server issues the link URL using the existing authenticated API session, so a browser never reads its HttpOnly access cookie.
- Google/Apple may be disconnected only after confirmation and only when Supabase reports another sign-in method. Email is listed as a method but is not removable through this UI.
- Apple Hide My Email can produce a relay address. If it does not link automatically to an existing account, it remains a separate account in v1; do not merge data manually through this feature.

## Verification checklist

1. Verify Google sign-in on iOS, Android, and web.
2. Verify native Apple sign-in on a real iOS device and Apple OAuth on web; verify Apple is absent on Android.
3. Verify same verified-email automatic linking, explicit linking with a different account/Apple relay email, and safe disconnect behavior.
4. Verify email/password login, logout, reset, refresh, and cookies/SecureStore behavior remain unchanged.
5. Check generated JavaScript, EAS/Vercel environment settings, logs, and repository history for provider secrets before release.

Useful references: [Supabase Expo social auth](https://supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-auth), [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking), [Supabase Apple setup](https://supabase.com/docs/guides/auth/social-login/auth-apple), and [Expo Apple Authentication](https://docs.expo.dev/versions/latest/sdk/apple-authentication/).
