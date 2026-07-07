import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(process.cwd(), "src");

function readSrc(relPath: string) {
  return readFileSync(resolve(SRC, relPath), "utf8");
}

// ── 1. Signup page must not expose a registration form ─────────────

describe("Signup route", () => {
  it("renders unavailable message, not a signup form", async () => {
    const mod = await import("@/app/signup/page");
    const SignupPage = mod.default;

    render(<SignupPage />);

    expect(screen.queryByText(/create account/i)).toBeNull();
    expect(screen.queryByText(/sign up/i)).toBeNull();
    expect(screen.queryByRole("textbox", { name: /email/i })).toBeNull();
    expect(screen.getByText(/signup unavailable/i)).toBeTruthy();
    expect(screen.getByText(/accounts are created by your organization administrator/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /go to login/i })).toBeTruthy();
  });

  it("does not import supabase client module", () => {
    const source = readSrc("app/signup/page.tsx");
    expect(source).not.toContain("@/lib/supabase/client");
    expect(source).not.toContain("@/lib/supabase/load-client");
    expect(source).not.toContain("createBrowserClient");
  });
});

// ── 2. Login page must not statically import Supabase ───────────────

describe("Login page bundle isolation", () => {
  it("does not statically import supabase client", () => {
    const source = readSrc("app/login/page.tsx");
    // Must not have a top-level static import of the supabase client
    expect(source).not.toMatch(/import\s*\{[^}]*\}\s*from\s*["']@\/lib\/supabase\/client["']/);
    // Must use the dynamic loader instead
    expect(source).toContain("loadSupabaseClient");
  });
});

// ── 3. Signup page must not link to signup from login ───────────────

describe("Login page no signup link", () => {
  it("does not contain a link to /signup", () => {
    const source = readSrc("app/login/page.tsx");
    expect(source).not.toContain("/signup");
  });
});
