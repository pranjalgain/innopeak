import { describe, expect, test } from "vitest";

import {
  returnPathFor,
  safeAdminReturnPath,
  safeTenantReturnPath,
  signInPathFor,
} from "../post-login-redirect";

describe("safeTenantReturnPath", () => {
  test.each([
    ["/dashboard", "/dashboard"],
    ["/review-queue", "/review-queue"],
    ["/review-queue/abc-123", "/review-queue/abc-123"],
    ["/review-queue?status=new&page=2", "/review-queue?status=new&page=2"],
    ["/settings?tab=billing", "/settings?tab=billing"],
    ["/settings/prompts", "/settings/prompts"],
  ])("keeps %s", (raw, expected) => {
    expect(safeTenantReturnPath(raw)).toBe(expected);
  });

  test.each([
    null,
    "",
    "dashboard",
    "https://evil.example/dashboard",
    "//evil.example/dashboard",
    "/\\evil.example",
    "/dashboard/../admin",
    "/dashboardx",
    "/admin",
    "/login",
    "/onboarding/connect",
    "/dashboard\n/evil",
    "javascript:alert(1)",
  ])("rejects %j", (raw) => {
    expect(safeTenantReturnPath(raw)).toBeNull();
  });
});

describe("safeAdminReturnPath", () => {
  test("keeps admin pages and rejects everything else", () => {
    expect(safeAdminReturnPath("/admin")).toBe("/admin");
    expect(safeAdminReturnPath("/admin/businesses?page=2&q=x")).toBe(
      "/admin/businesses?page=2&q=x",
    );
    expect(safeAdminReturnPath("/dashboard")).toBeNull();
    expect(safeAdminReturnPath("/administrator")).toBeNull();
    expect(safeAdminReturnPath("//admin")).toBeNull();
  });
});

describe("returnPathFor", () => {
  test("joins path and query for the matching kind only", () => {
    expect(returnPathFor("/review-queue", "?status=new", "tenant")).toBe(
      "/review-queue?status=new",
    );
    expect(returnPathFor("/admin/users", "", "admin")).toBe("/admin/users");
    expect(returnPathFor("/onboarding/plan", "", "tenant")).toBeNull();
    expect(returnPathFor("/admin/users", "", "tenant")).toBeNull();
  });
});

describe("signInPathFor", () => {
  test("sends a tenant to /login and an admin to /admin-login, remembering the page", () => {
    expect(signInPathFor("tenant", "/review-queue", "?status=new")).toBe(
      "/login?next=%2Freview-queue%3Fstatus%3Dnew",
    );
    expect(signInPathFor("admin", "/admin/users", "")).toBe("/admin-login?next=%2Fadmin%2Fusers");
  });

  test("does nothing off the guarded pages", () => {
    expect(signInPathFor("tenant", "/", "")).toBeNull();
    expect(signInPathFor("tenant", "/onboarding/connect", "")).toBeNull();
    expect(signInPathFor("tenant", "/login", "")).toBeNull();
    expect(signInPathFor("tenant", "/admin", "")).toBeNull();
  });
});
