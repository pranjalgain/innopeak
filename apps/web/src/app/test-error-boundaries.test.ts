import { describe, expect, test } from "vitest";

import { RouteError } from "@/components/common/route-error";

import AuthError from "./(auth)/error";
import DashboardError from "./(dashboard)/error";
import AdminError from "./admin/error";

// Without a boundary in each route group a render error replaced the whole page, shell and sign-out included.
describe("route group error boundaries", () => {
  test.each([
    ["(dashboard)", DashboardError],
    ["admin", AdminError],
    ["(auth)", AuthError],
  ])("%s uses the shared RouteError", (_group, boundary) => {
    expect(boundary).toBe(RouteError);
  });
});
