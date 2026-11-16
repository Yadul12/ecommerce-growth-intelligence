import { NextResponse } from "next/server";
import { queryOne, isDatabaseConfigured, DatabaseUnavailableError } from "@/lib/server/db";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        status: "unconfigured",
        message: "DATABASE_URL environment variable is not configured.",
      },
      { status: 503 }
    );
  }

  const start = performance.now();
  try {
    const res = await queryOne<{ now: string; count: number }>(
      "SELECT NOW()::text AS now, (SELECT COUNT(*) FROM users) AS count;"
    );
    const latencyMs = Math.round(performance.now() - start);

    return NextResponse.json({
      status: "connected",
      latencyMs,
      serverTime: res.now,
      usersCount: res.count,
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    if (err instanceof DatabaseUnavailableError) {
      return NextResponse.json(
        {
          status: "unavailable",
          reason: err.reason,
          latencyMs,
          message: err.message,
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        status: "error",
        latencyMs,
        message: "Failed to connect to PostgreSQL database.",
      },
      { status: 500 }
    );
  }
}
