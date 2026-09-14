# Security Standards — Mandatory for All Implementation

> **Every agent must consult this file before implementing any feature involving data input, authentication, external communication, or storage. No exceptions.**
>
> **Status: General placeholder — stack-agnostic.** Extend with language/framework-specific guidance once the tech stack is confirmed.

---

## 1. Secrets & Environment Variable Management

- **Never hardcode secrets, API keys, tokens, passwords, or any sensitive value in source code** — not even in test files, fixtures, or comments. No exceptions.
- **All secrets must be managed via environment variables** loaded from `.env` files that are excluded from version control via `.gitignore`.
- **A `.env.example` file must always exist at the repository root**, containing all required variable names with placeholder values and a description comment for each — this file is committed to the repository. Example:
  ```env
  # Application environment: development | staging | production
  APP_ENV=development
  # Database connection string
  DATABASE_URL=postgresql://user:password@localhost:5432/app_dev
  # JWT signing secret — generate with: openssl rand -hex 32
  JWT_SECRET=your-secret-here
  ```
- **The agent must never log, print, or expose environment variable values** in output, error messages, or debug statements. Redact secrets in logs.
- **Verify `.env` is listed in `.gitignore` before writing any code that reads from it.** Run `git check-ignore .env` or inspect `.gitignore`. If not ignored, add it first — this is a blocker.

---

## 2. Environment Configuration

- **Three environments must be distinguished:** `development`, `staging`, `production` (see `ENVIRONMENT_GUIDE.md` for definitions).
- **An `APP_ENV` or equivalent variable must control environment-specific behavior.** No hardcoded `if (env === "production")` scattered across code — centralize environment-aware configuration.
- **Configuration that differs per environment** (log level, debug mode, external service URLs, rate limits, feature flags) **must be driven by environment variables** — never by hardcoded conditionals or committed config files with secrets.
- **Default to secure settings.** If `APP_ENV` is unset or unrecognized, behave as production (least privilege, no debug).

---

## 3. Input Validation & Sanitization

- **All external input must be validated and sanitized before use in any business logic.** External input includes: HTTP request bodies, query parameters, headers, file uploads, cookies, environment variables read at runtime, and any data from third-party services.
- **Validation must happen at the boundary layer** (handler / controller / middleware) before input reaches service or data layers. Do not validate deep inside business logic as a substitute.
- **Never trust client-supplied data for authorization decisions.** Re-derive permissions server-side from authenticated session/token.
- **Reject and return a clear error for any input that does not conform to the expected schema** — do not attempt to silently coerce, guess intent, or fix malformed input.
- **Use a schema validation library appropriate to the stack** (e.g., Zod, Pydantic, Joi, json-schema) — do not hand-roll regex validation for complex formats unless justified and documented.

---

## 4. Authentication & Authorization

- **Authentication and authorization logic must never be implemented ad-hoc** — use the established framework/library pattern for this stack once determined. Do not invent custom auth unless explicitly required and reviewed.
- **All protected routes must enforce auth checks — default to deny, not allow.** Every new endpoint is protected unless explicitly documented as public.
- **Never implement a "skip auth for now, add later" pattern** — incomplete auth is a **blocker** and must be raised immediately in `CURRENT_STATUS.md`. Do not defer security to a future task without explicit user approval.
- **Session tokens and JWTs must be validated on every request**, not just on login. Check signature, expiration, issuer, and audience. Use constant-time comparison where applicable.
- **Passwords must be hashed with a strong, adaptive algorithm** (e.g., bcrypt, argon2) — never store plaintext or reversible-encrypted passwords.
- **Rate-limit authentication endpoints** (login, password reset, token refresh) to mitigate brute force and credential stuffing.

---

## 5. Dependency Security

- **Before adding any new dependency, check for known vulnerabilities** using the appropriate tool for the stack:
  | Stack | Command |
  |-------|---------|
  | Node.js | `npm audit` / `yarn audit` |
  | Python | `pip-audit` |
  | Go | `govulncheck ./...` |
  | Ruby | `bundle audit` |
  | Rust | `cargo audit` |
- **Prefer well-maintained, widely adopted packages** over obscure alternatives. Check maintenance status, issue activity, and download counts.
- **Pin dependency versions** — avoid open-ended ranges (`*`, `^`, `latest`) that auto-upgrade to potentially breaking or vulnerable versions. Use lock files and commit them.
- **Log any new dependency added in `state/DECISIONS_LOG.md`** with rationale and confirmation that a vulnerability check was performed. Include the tool output summary.

---

## 6. Docker & Container Security

- **Never run application containers as root** — use a non-root user in the Dockerfile (`USER appuser`).
- **Do not expose unnecessary ports in production Compose configuration.** Only expose what the application needs.
- **Never commit `.env` files** — use Docker secrets or environment variable injection at runtime for production deployments (`env_file` or orchestrator secrets).
- **Use specific image tags — never use `latest` in production configurations.** Pin to a digest or explicit version (`node:20.11-alpine`, not `node:latest`).
- **Keep base images updated** and rebuild regularly to pick up security patches.
- **Scan images for vulnerabilities** where tooling is available (e.g., `docker scout`, `trivy`, `grype`).

---

## 7. Data Protection & Output Security

- **Never expose sensitive data in logs, error messages, or API responses.** This includes stack traces, file paths, query strings with tokens, or database internals.
- **Use structured error envelopes** for API responses — return a generic message to the client, log the detail server-side with correlation IDs.
- **Apply least privilege to data access.** Services and database users must have only the permissions they need.
- **Encrypt sensitive data at rest and in transit** (TLS for network, appropriate encryption for stored secrets).
- **Implement security headers** appropriate to the stack (e.g., `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`) once the web framework is known.

---

> **Self-update instruction:** When the tech stack is confirmed, extend this file with language and framework-specific security guidance, for example: ORM injection prevention (parameterized queries, ORM usage patterns), CORS configuration, CSRF protection, rate limiting middleware, security headers, secret rotation, and audit logging. Keep the general rules above — add stack-specific sections below them with concrete library names and config examples.
