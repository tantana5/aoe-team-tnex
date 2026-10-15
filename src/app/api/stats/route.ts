import { NextResponse } from "next/server";
import { getPlayerStats } from "@/lib/matches";

export const dynamic = "force-dynamic";

/** GET /api/stats -> thắng/thua từng player (từ matches + match_player_history). */
export async function GET() {
  try {
    return NextResponse.json(await getPlayerStats());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi đọc thống kê";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
