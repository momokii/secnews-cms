import { z } from "zod/v4";
import { UserPublicSchema, passwordField, emailField } from "../auth/schema.js";

/** First-run setup. Only legal while the users table is empty; any later
 * call → 409 CONFLICT (S4: double-bootstrap regression BST-01). */

// POST /bootstrap
export const BootstrapBodySchema = z.object({
  name: z.string().min(1),
  email: emailField,
  password: passwordField,
});
export const BootstrapResponseSchema = z.object({
  user: UserPublicSchema,
  token: z.string(),
});
