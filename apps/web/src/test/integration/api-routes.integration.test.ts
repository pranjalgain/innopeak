import { describe, expect, test } from "vitest";

import { GET as GET_HEALTH } from "@/app/api/health/route";

describe("API route integration tests", () => {
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
});
