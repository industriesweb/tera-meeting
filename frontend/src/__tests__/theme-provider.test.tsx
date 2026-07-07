import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";
import { ThemeProvider, useTheme } from "@/providers/theme-provider";

function TestComponent() {
  const { theme, toggle } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggle} data-testid="toggle">
        Toggle
      </button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" ? false : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("light mode: no dark class on <html>", () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("dark mode toggle: adds dark class on <html>", () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    act(() => {
      screen.getByTestId("toggle").click();
    });

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });

  it("persisted preference restores correctly", () => {
    localStorage.setItem("theme", "dark");

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("system mode follows prefers-color-scheme if supported", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" ? true : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("semantic color classes remain in rendered components", () => {
    render(
      <ThemeProvider>
        <div className="bg-background text-on-surface">Test</div>
      </ThemeProvider>
    );

    const el = screen.getByText("Test");
    expect(el.className).toContain("bg-background");
    expect(el.className).toContain("text-on-surface");
  });

  it("toggle switches back to light", () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    act(() => {
      screen.getByTestId("toggle").click();
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      screen.getByTestId("toggle").click();
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
  });

  it("persists to localStorage on toggle", () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    act(() => {
      screen.getByTestId("toggle").click();
    });

    expect(localStorage.getItem("theme")).toBe("dark");

    act(() => {
      screen.getByTestId("toggle").click();
    });

    expect(localStorage.getItem("theme")).toBe("light");
  });
});
