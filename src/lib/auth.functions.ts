import { createServerFn } from "@tanstack/react-start";
import { Credentials, RequestReset, NewPassword } from "./auth-input";

export const signInWithPassword = createServerFn({ method: "POST" })
  .validator((input: unknown) => Credentials.parse(input))
  .handler(async ({ data }) =>
    (await import("./auth-handler.server")).authenticateWithPassword(data),
  );

export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((input: unknown) => RequestReset.parse(input))
  .handler(async ({ data }) => (await import("./auth-handler.server")).requestPasswordReset(data));

export const updatePassword = createServerFn({ method: "POST" })
  .validator((input: unknown) => NewPassword.parse(input))
  .handler(async ({ data }) => (await import("./auth-handler.server")).updatePassword(data));
