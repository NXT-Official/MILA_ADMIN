import { createClient, type Session } from "@supabase/supabase-js";
import { getRequestIP, getRequestUrl } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";
import { requireEnv } from "./env";
import { consumeRateLimit, RateLimitExceededError, type RateLimitStore } from "./rate-limit.server";
import { captureServerException } from "./sentry.server";
import {
  Credentials,
  RequestReset,
  NewPassword,
  type CredentialsInput,
  type RequestResetInput,
  type NewPasswordInput,
} from "./auth-input";

// Staff credentials are a privileged access surface — brute-forcing one
// account should be materially harder than exhausting a single IP's budget,
// so login is limited on the (ip, email) pair rather than either alone. A
// captcha already covers the honest-mistake case; this covers the
// distributed/automated one where a per-request captcha token is present but
// automatically solved or replayed.
const LOGIN_RATE_LIMIT_POLICY = { limit: 10, windowSeconds: 15 * 60 };

function requestIp(): string {
  return getRequestIP({ xForwardedFor: true }) ?? "unknown";
}

function authClient() {
  const env = requireEnv({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  });
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function requestOrigin(): string {
  return getRequestUrl({ xForwardedHost: true, xForwardedProto: true }).origin;
}

export type AuthDependencies = {
  client: typeof authClient;
  origin: typeof requestOrigin;
  ip: typeof requestIp;
  rateLimitStore?: RateLimitStore;
};

const defaults: AuthDependencies = {
  client: authClient,
  origin: requestOrigin,
  ip: requestIp,
};

export async function authenticateWithPassword(
  data: CredentialsInput,
  deps = defaults,
): Promise<{ session: Session | null }> {
  const parsed = Credentials.parse(data);

  try {
    await consumeRateLimit(
      `admin_login:${deps.ip()}:${parsed.email.toLowerCase()}`,
      LOGIN_RATE_LIMIT_POLICY,
      deps.rateLimitStore,
    );
  } catch (err) {
    if (err instanceof RateLimitExceededError) {
      throw new Error("Too many sign-in attempts. Please try again later.");
    }
    throw err;
  }

  const auth = deps.client().auth;
  const result = await auth.signInWithPassword({
    email: parsed.email,
    password: parsed.password,
    options: { captchaToken: parsed.captchaToken },
  });
  if (result.error) {
    captureServerException(result.error);
    console.warn(JSON.stringify({ event: "authentication_failure", method: "password" }));
    throw new Error("Email, password, or verification challenge is invalid.");
  }
  return { session: result.data.session };
}

export async function requestPasswordReset(
  input: RequestResetInput,
  deps = defaults,
): Promise<{ ok: true }> {
  const data = RequestReset.parse(input);
  const auth = deps.client().auth;
  const { error } = await auth.resetPasswordForEmail(data.email, {
    redirectTo: `${deps.origin()}/reset-password`,
    captchaToken: data.captchaToken,
  });
  if (error) {
    captureServerException(error);
    console.warn(JSON.stringify({ event: "password_reset_request_failure" }));
    throw new Error("Unable to send the reset link right now. Please try again later.");
  }
  // Supabase returns success regardless of whether the email is registered,
  // so this response never confirms or denies account existence.
  return { ok: true };
}

export async function updatePassword(
  input: NewPasswordInput,
  deps = defaults,
): Promise<{ ok: true }> {
  const data = NewPassword.parse(input);
  const client = deps.client();
  const { error: sessionError } = await client.auth.setSession({
    access_token: data.accessToken,
    refresh_token: data.refreshToken,
  });
  if (sessionError) {
    captureServerException(sessionError);
    console.warn(JSON.stringify({ event: "password_reset_session_invalid" }));
    throw new Error("Your reset link has expired. Please request a new one.");
  }
  const { error } = await client.auth.updateUser({ password: data.password });
  if (error) {
    captureServerException(error);
    console.warn(JSON.stringify({ event: "password_reset_update_failure" }));
    throw new Error("Unable to update your password. Please try again.");
  }
  return { ok: true };
}
