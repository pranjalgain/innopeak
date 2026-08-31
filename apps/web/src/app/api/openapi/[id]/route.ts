import { NextRequest, NextResponse } from "next/server";

/**
 * Get OpenApi information
 * @description Fetches detailed OpenApi information by ID
 * @pathParams OpenApiParams
 * @response OpenApiResponse
 * @openapi
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ id, name: "OpenApi 1", price: 100 });
}
