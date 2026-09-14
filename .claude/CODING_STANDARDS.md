# Coding Standards — Stack-Agnostic Best Practices

> **Status: General placeholder.** Replace and extend with language/framework-specific conventions once the tech stack is confirmed. See Self-Update Instruction at the bottom.

---

## 1. General Principles

- **Clarity over cleverness** — code is read more than it is written. Prefer readable, boring code over clever one-liners.
- **One responsibility per function, file, and module.** If you cannot describe what a unit does in a single sentence, split it.
- **Explicit is better than implicit.** Name things fully, pass dependencies explicitly, avoid hidden magic.
- **Fail fast and loudly** — surface errors at the earliest possible point with clear messages and sufficient context to reproduce.
- **Keep it simple (YAGNI).** Do not build abstractions for hypothetical future needs. Solve the current task well.
- **Consistency beats preference.** Match the existing codebase's style even if you would have chosen differently — unless you are explicitly migrating the style and documenting it.

---

## 2. Naming Conventions (General)

| Target | Convention | Example |
|--------|------------|---------|
| Files | `kebab-case` (follow established pattern once determined) | `user-service.ts`, `payment_handler.go` |
| Functions / methods | Descriptive verb-noun pairs | `getUserById`, `validateInput`, `createOrder` |
| Variables | Descriptive nouns, avoid single letters except trivial loops | `userCount`, `isAuthenticated` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT`, `DEFAULT_TIMEOUT_MS` |
| Boolean variables | Prefix with `is`, `has`, `should`, `can` | `isActive`, `hasPermission`, `shouldRetry` |
| Classes / types | `PascalCase` | `UserService`, `PaymentRequest` |
| Interfaces / protocols | `PascalCase`, often suffixed with `I` or descriptive noun | `UserRepository`, `PaymentProcessor` |

- Avoid abbreviations unless universally understood (`id`, `url`, `api`). When in doubt, spell it out.
- Names must reveal intent — `data` and `info` are not names.

---

## 3. Code Organization

- **File size:** Keep files under ~300 lines. If a file grows beyond that, it likely has multiple responsibilities — split it.
- **Function size:** Prefer functions under ~40 lines. Extract helpers rather than nesting deeply.
- **Module boundaries:** Each module exposes a narrow public API; internals remain private. Document the public surface explicitly where applicable.
- **Dependency direction:** Dependencies flow toward abstractions, not concretions. Avoid circular dependencies.
- **Configuration:** Centralize configuration. No magic numbers or hardcoded URLs scattered across files.

---

## 4. Error Handling

- **Never silently swallow errors.** Every `catch` / error branch must either handle the error meaningfully or propagate it with context.
- **All errors must be logged with sufficient context to reproduce** — include operation name, relevant identifiers (never secrets), and the original error.
- **User-facing errors must never expose internal stack traces or system details.** Return a generic message to the client; log the detail server-side.
- **Use typed / structured errors where the language supports it.** Prefer domain error types over stringly-typed messages.
- **Validate at boundaries, not deep in the call stack.** Fail early at handler/controller layers before business logic runs.

```text
Bad:   catch (e) { /* ignore */ }
Bad:   return { error: e.stack }  // leaks internals
Good:  catch (e) { logger.error("Failed to create user", { userId, cause: e }); throw new UserCreationError("Creation failed", { cause: e }); }
```

---

## 5. Testing

- **Every new feature must include at least one test** that verifies its primary behavior.
- **Every bug fix must include a regression test** that would have caught the bug.
- **Tests must be runnable with a single command** (e.g., `make test`, `npm test`, `go test ./...`, `pytest`). Document the command in `README.md` and `ENVIRONMENT_GUIDE.md` once known.
- **Test naming:** Test names describe behavior, not implementation: `should_reject_invalid_email` not `test_validate_1`.
- **Isolation:** Tests must be isolated — no dependency on shared mutable state unless intentional (and documented). No reliance on execution order.
- **No real secrets in tests:** Use test doubles, fixtures, and factories with fake data. Never commit real API keys or credentials even in test files.
- **Assertions:** Be specific and meaningful. Assert observable outcomes, not just “no error thrown”.

---

## 6. Documentation

- **Every public function must have a descriptive comment or docstring** explaining what it does, its parameters, return value, and error conditions.
- **Every non-obvious decision in code must have an inline comment explaining *why*, not *what*.** The code shows what; the comment explains why this approach was chosen.
- **Keep documentation adjacent to code.** Stale docs in a wiki are worse than no docs — update comments when you update code.
- **README and API contract docs must stay in sync with behavior.** Update them as part of the same change that modifies behavior.

---

## 7. Style & Formatting

- **Use an automated formatter** (`prettier`, `gofmt`, `black`, `rustfmt`, etc.) — never hand-format. Add the formatter config to the repo once the stack is known and enforce it via pre-commit or CI.
- **Use a linter** and fix all warnings before committing. Treat linter warnings as errors unless explicitly suppressed with justification.
- **No commented-out code in commits.** Delete it — version control preserves history.
- **Commit messages:** Short imperative summary line + body explaining why. Reference task ID where applicable (`TASK-001: Add user validation`).

---

## 8. Version Control Hygiene

- **One logical change per commit.** Do not mix refactoring with feature work in the same commit.
- **Never commit secrets, `.env` files, or generated artifacts** that belong in `.gitignore`.
- **Verify `.env` is gitignored before the first commit of any session** — `git check-ignore .env` must succeed.
- **Branch naming:** `feature/<task-id>-short-description`, `fix/<task-id>-short-description` unless the team adopts a different convention — then follow the team convention and document it here.

---

> **Self-update instruction:** When the tech stack is confirmed, replace this file's general rules with language/framework-specific conventions, linting config references (e.g., `.eslintrc`, `pyproject.toml`, `golangci-lint`), and actual patterns observed in the codebase. Include: formatter & linter commands, import ordering rules, preferred project layout, and examples from real files. Keep the General Principles — add stack-specific sections below them.
