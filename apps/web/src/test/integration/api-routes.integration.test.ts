import { describe, expect, test } from "vitest";

import { GET as GET_HEALTH } from "@/app/api/health/route";
import { GET as GET_SIMPLE } from "@/app/api/simple-users/route";

describe("Simple API Integration Tests", () => {
  describe("GET /api/health", () => {
    test("should return health status", async () => {
      const response = await GET_HEALTH();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty("status", "ok");
      expect(data).toHaveProperty("timestamp");
      expect(data).toHaveProperty("uptime");
      expect(typeof data.uptime).toBe("number");
    });
  });

  describe("GET /api/simple-users", () => {
    test("should return 2 hardcoded users", async () => {
      const response = await GET_SIMPLE();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        users: [
          { id: "1", name: "John Doe", email: "john@example.com" },
          { id: "2", name: "Jane Smith", email: "jane@example.com" },
        ],
        total: 2,
      });
    });

    test("should return consistent data structure", async () => {
      const response = await GET_SIMPLE();
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.total).toBe(2);
      expect(data.users).toHaveLength(2);

      // Check user structure
      data.users.forEach((user: { id: string; name: string; email: string }) => {
        expect(user).toHaveProperty("id");
        expect(user).toHaveProperty("name");
        expect(user).toHaveProperty("email");
        expect(typeof user.id).toBe("string");
        expect(typeof user.name).toBe("string");
        expect(typeof user.email).toBe("string");
      });
    });
  });
});
