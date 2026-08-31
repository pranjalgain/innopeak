import { NextRequest } from "next/server";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { UserService } from "@/app/_libs/services/user.service";
import { GET as GET_HEALTH } from "@/app/api/health/route";
import { GET as GET_SIMPLE } from "@/app/api/simple-users/route";
import { DELETE, GET, POST } from "@/app/api/users/route";

describe("Simple API Integration Tests", () => {
  beforeEach(() => {
    // Reset test data before each test
    UserService.reset();
  });

  afterEach(() => {
    // Clean up after each test
    UserService.reset();
  });

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

  describe("GET /api/users", () => {
    test("should return empty users list initially", async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        users: [],
        total: 0,
      });
    });

    test("should return users when they exist", async () => {
      // Create test users directly
      await UserService.createUser({ name: "John Doe", email: "john@example.com" });
      await UserService.createUser({ name: "Jane Smith", email: "jane@example.com" });
      await UserService.createUser({ name: "Bob Johnson", email: "bob@example.com" });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.users).toHaveLength(3);
      expect(data.total).toBe(3);
    });
  });

  describe("POST /api/users", () => {
    test("should create a new user successfully", async () => {
      const userData = {
        name: "John Doe",
        email: "john@example.com",
      };

      const request = new NextRequest("http://localhost:3000/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.message).toBe("User created successfully");
      expect(data.user).toMatchObject({
        name: "John Doe",
        email: "john@example.com",
      });
      expect(data.user).toHaveProperty("id");
      expect(data.user).toHaveProperty("createdAt");
    });

    test("should validate required fields", async () => {
      const invalidData = { name: "", email: "test@example.com" };

      const request = new NextRequest("http://localhost:3000/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invalidData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Validation failed");
      expect(data).toHaveProperty("details");
    });

    test("should prevent duplicate email addresses", async () => {
      const userData = {
        name: "John Doe",
        email: "john@example.com",
      };

      // Create first user
      const request1 = new NextRequest("http://localhost:3000/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      });

      const response1 = await POST(request1);
      expect(response1.status).toBe(201);

      // Try to create second user with same email
      const duplicateUserData = {
        name: "Jane Doe",
        email: "john@example.com", // Same email
      };

      const request2 = new NextRequest("http://localhost:3000/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(duplicateUserData),
      });

      const response2 = await POST(request2);
      const data2 = await response2.json();

      expect(response2.status).toBe(409);
      expect(data2).toEqual({
        success: false,
        error: "User with this email already exists",
      });
    });
  });

  describe("DELETE /api/users", () => {
    test("should reset users successfully", async () => {
      // First create some users directly
      await UserService.createUser({ name: "John Doe", email: "john@example.com" });
      await UserService.createUser({ name: "Jane Smith", email: "jane@example.com" });

      // Verify users exist
      let response = await GET();
      let data = await response.json();
      expect(data.users.length).toBeGreaterThan(0);

      // Reset users
      const deleteResponse = await DELETE();
      const deleteData = await deleteResponse.json();

      expect(deleteResponse.status).toBe(200);
      expect(deleteData).toEqual({
        success: true,
        message: "All users deleted",
      });

      // Verify users are gone
      response = await GET();
      data = await response.json();
      expect(data.users).toHaveLength(0);
    });
  });
});
