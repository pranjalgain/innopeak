import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { UserService } from "@/app/_libs/services/user.service";

// Validation schemas
const CreateUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
  email: z.string().trim().email("Invalid email format").max(255, "Email too long"),
});

// GET /api/users - Fetch all users
export async function GET() {
  try {
    const users = await UserService.getAllUsers();

    return NextResponse.json({
      success: true,
      users,
      total: users.length,
    });
  } catch (error) {
    console.error("Error fetching users:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch users",
      },
      { status: 500 },
    );
  }
}

// DELETE /api/users - Reset all users (for testing)
export async function DELETE() {
  try {
    UserService.reset();

    return NextResponse.json({
      success: true,
      message: "All users deleted",
    });
  } catch (error) {
    console.error("Error deleting users:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete users",
      },
      { status: 500 },
    );
  }
}

// POST /api/users - Create a new user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validationResult = CreateUserSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: validationResult.error.format(),
        },
        { status: 400 },
      );
    }

    const { name, email } = validationResult.data;

    // Check if user with email already exists
    const existingUser = await UserService.getUserByEmail(email);
    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: "User with this email already exists",
        },
        { status: 409 },
      );
    }

    // Create user
    const user = await UserService.createUser({ name, email });

    return NextResponse.json(
      {
        success: true,
        user,
        message: "User created successfully",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating user:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to create user",
      },
      { status: 500 },
    );
  }
}
