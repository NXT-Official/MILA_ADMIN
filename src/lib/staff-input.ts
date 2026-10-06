import { z } from "zod";

/**
 * Input rules for the forms staff fill in, shared by the browser and the server
 * so both say the same thing. zod's own `error.message` is a JSON dump of every
 * issue; a toast must show one plain sentence instead.
 */

/** The first problem, in the words its rule was written with. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the details and try again.";
}

/** The first problem per field, keyed by the field's name, for showing under each input. */
export function fieldMessages(error: z.ZodError): Record<string, string> {
  const messages: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (field && !(field in messages)) messages[field] = issue.message;
  }
  return messages;
}

/** `schema.parse` that throws one plain sentence rather than zod's JSON. */
export function parseInput<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(firstIssueMessage(result.error));
  return result.data;
}

const fullNameSchema = z.string().trim().max(100, "Keep the name under 100 characters.");

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Usernames need at least 3 characters.")
  .max(30, "Keep the username under 30 characters.")
  .regex(/^[a-zA-Z0-9_-]+$/, "Usernames can only use letters, numbers, - and _.");

export const createMemberInputSchema = z.object({
  email: z
    .string({ required_error: "Enter an email address." })
    .email("Enter a valid email address."),
  password: z
    .string({ required_error: "Choose a password." })
    .min(8, "Use at least 8 characters for the password."),
  full_name: fullNameSchema.optional(),
  username: usernameSchema.optional(),
});

export const updateMemberInputSchema = z.object({
  user_id: z.string().uuid("Couldn't tell which member to update."),
  full_name: fullNameSchema.optional(),
  // An empty username is allowed: it clears the field.
  username: usernameSchema.optional().or(z.literal("")),
});

export const announcementSubjectSchema = z
  .string()
  .trim()
  .min(3, "Give the update a subject of at least 3 characters.")
  .max(120, "Keep the subject under 120 characters.");

export const announcementBodySchema = z
  .string()
  .trim()
  .min(10, "Write at least 10 characters about what changed.")
  .max(8000, "Keep the message under 8,000 characters.");

export const announcementInputSchema = z.object({
  subject: announcementSubjectSchema,
  body: announcementBodySchema,
  confirm: z.literal(true, {
    errorMap: () => ({ message: "Confirm that this emails every member." }),
  }),
});
