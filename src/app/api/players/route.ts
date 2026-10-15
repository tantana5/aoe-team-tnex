import { NextRequest, NextResponse } from "next/server";
import {
  getSupabase,
  PLAYER_COLUMNS,
  PLAYERS_TABLE,
  supabaseErrorMessage,
} from "@/lib/supabase";
import {
  normalizeName,
  validateName,
  validateScore,
  toPlayerRecord,
  type PlayerRecord,
} from "@/lib/players";

export const dynamic = "force-dynamic";

/** Player dùng ở trang chia team. */
export type Player = {
  id: number;
  name: string;
  score: number;
};

/**
 * GET /api/players          -> player đang bật (dùng cho trang chia team)
 * GET /api/players?all=1    -> toàn bộ player kèm trạng thái (trang quản lý)
 */
export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get("all") === "1";
  try {
    const { data, error } = await getSupabase()
      .from(PLAYERS_TABLE)
      .select(PLAYER_COLUMNS)
      .order("name");
    if (error) throw new Error(supabaseErrorMessage(error));
    const records: PlayerRecord[] = (data ?? []).map((row) =>
      toPlayerRecord(row as Record<string, unknown>)
    );

    if (all) return NextResponse.json({ players: records });

    const players: Player[] = records
      .filter((p) => p.active)
      .map(({ id, name, score }) => ({ id, name, score }));
    return NextResponse.json({ players });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi đọc danh sách player";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/players -> thêm player { name, score, active? }.
 * Nếu đã có player trùng tên thì cập nhật điểm player đó thay vì thêm mới.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      name?: unknown;
      score?: unknown;
      active?: unknown;
    } | null;
    if (!body) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const name = validateName(body.name);
    if (typeof name !== "string") {
      return NextResponse.json({ error: name.error }, { status: 400 });
    }
    const score = validateScore(body.score);
    if (typeof score !== "number") {
      return NextResponse.json({ error: score.error }, { status: 400 });
    }

    const sb = getSupabase();

    // DB không có unique constraint trên name -> tự tìm player trùng tên
    // (so sánh sau khi chuẩn hóa khoảng trắng/Unicode, giống logic import).
    const { data: all, error: readErr } = await sb
      .from(PLAYERS_TABLE)
      .select("id, name");
    if (readErr) throw new Error(supabaseErrorMessage(readErr));
    const existing = (all ?? []).find((p) => normalizeName(p.name) === name);

    if (existing) {
      // Trùng tên -> cập nhật điểm thay vì thêm mới (giữ nguyên trạng thái bật/tắt).
      const { data, error } = await sb
        .from(PLAYERS_TABLE)
        .update({ point: score, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select(PLAYER_COLUMNS)
        .maybeSingle();
      if (error) throw new Error(supabaseErrorMessage(error));
      if (!data) {
        return NextResponse.json(
          { error: "Không cập nhật được player (có thể do không có quyền ghi)." },
          { status: 403 }
        );
      }
      return NextResponse.json({
        player: toPlayerRecord(data as Record<string, unknown>),
        updated: true,
      });
    }

    const { data, error } = await sb
      .from(PLAYERS_TABLE)
      .insert({ name, point: score, is_enable: body.active !== false })
      .select(PLAYER_COLUMNS)
      .single();
    if (error) throw new Error(supabaseErrorMessage(error));

    return NextResponse.json(
      { player: toPlayerRecord(data as Record<string, unknown>), updated: false },
      { status: 201 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi thêm player";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
