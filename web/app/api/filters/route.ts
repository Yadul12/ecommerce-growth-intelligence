import { NextResponse } from "next/server";
import { getFilterOptions } from "@/lib/server/queries/filters";
import { DatabaseUnavailableError } from "@/lib/server/db";

export async function GET() {
  try {
    const opts = await getFilterOptions();
    return NextResponse.json(opts);
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: err.status });
    }
    console.error("Filter options error:", err);
    return NextResponse.json({ error: "Failed to load filter options" }, { status: 500 });
  }
}
