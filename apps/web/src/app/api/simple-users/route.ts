import { NextResponse } from "next/server";

// Simple GET endpoint that returns 2 hardcoded users
export async function GET() {
  const users = [
    { id: "1", name: "John Doe", email: "john@example.com" },
    { id: "2", name: "Jane Smith", email: "jane@example.com" },
  ];

  return NextResponse.json({
    success: true,
    users,
    total: users.length,
  });
}
