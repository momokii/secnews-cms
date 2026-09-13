import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "./App";
import { clearToken, setToken } from "./lib/tokenStore";

describe("ROUTE-01: unauthenticated redirect", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    clearToken();
  });

  it("redirects /feeds to /login when no token is stored", () => {
    // Given: no token in tokenStore
    clearToken();

    // When: the app is rendered at /feeds
    render(
      <MemoryRouter initialEntries={["/feeds"]}>
        <App />
      </MemoryRouter>,
    );

    // Then: the login stub is shown and the protected page is not
    expect(screen.getByRole("heading", { name: "Login" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Feeds" })).toBeNull();
  });

  it("renders the protected page when a token is stored", () => {
    // Given: a token in tokenStore
    setToken("valid-token");

    // When: the app is rendered at /feeds
    render(
      <MemoryRouter initialEntries={["/feeds"]}>
        <App />
      </MemoryRouter>,
    );

    // Then: the feeds stub is shown inside the app shell
    expect(screen.getByRole("heading", { name: "Feeds" })).toBeTruthy();
  });
});
