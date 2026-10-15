import { NextResponse } from "next/server";
import { getLatestMatch } from "@/lib/matches";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ match: await getLatestMatch() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi đọc dữ liệu";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
