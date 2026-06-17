import { NextResponse } from "next/server";
import { readStore } from "@/lib/store";
import type { SavedMatch } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const store = await readStore();

    let latest: SavedMatch | null = null;
    for (const m of store) {
      if (!latest || m.createdAt > latest.createdAt) {
        latest = m;
      }
    }

    return NextResponse.json({ match: latest });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi đọc dữ liệu";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
