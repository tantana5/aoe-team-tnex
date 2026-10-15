import { NextRequest, NextResponse } from "next/server";
import {
  getSupabase,
  PLAYER_COLUMNS,
  PLAYERS_TABLE,
  supabaseErrorMessage,
} from "@/lib/supabase";
import { toPlayerRecord, validateName, validateScore } from "@/lib/players";

export const dynamic = "force-dynamic";

/** PATCH /api/players/:id -> sửa tên, điểm và/hoặc bật/tắt { name?, score?, active? } */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as {
      name?: unknown;
      score?: unknown;
      active?: unknown;
    } | null;
    if (!body) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const sb = getSupabase();

    // tên cột theo DB (điểm: `point`, bật/tắt: `is_enable`)
    const patch: { name?: string; point?: number; is_enable?: boolean } = {};

    if (body.name !== undefined) {
      const name = validateName(body.name);
      if (typeof name !== "string") {
        return NextResponse.json({ error: name.error }, { status: 400 });
      }
      // DB không có unique constraint trên name -> tự kiểm tra trùng tên
      const { data: dup, error: dupErr } = await sb
        .from(PLAYERS_TABLE)
        .select("id")
        .eq("name", name)
        .neq("id", id)
        .limit(1);
      if (dupErr) throw new Error(supabaseErrorMessage(dupErr));
      if (dup && dup.length > 0) {
        return NextResponse.json(
          { error: `Player "${name}" đã tồn tại.` },
          { status: 409 }
        );
      }
      patch.name = name;
    }
    if (body.score !== undefined) {
      const score = validateScore(body.score);
      if (typeof score !== "number") {
        return NextResponse.json({ error: score.error }, { status: 400 });
      }
      patch.point = score;
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        return NextResponse.json(
          { error: "Trạng thái phải là true/false" },
          { status: 400 }
        );
      }
      patch.is_enable = body.active;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Không có gì để cập nhật" }, { status: 400 });
    }

    const { data, error } = await sb
      .from(PLAYERS_TABLE)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(PLAYER_COLUMNS)
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `Player "${patch.name}" đã tồn tại.` },
          { status: 409 }
        );
      }
      throw new Error(supabaseErrorMessage(error));
    }
    if (!data) {
      return NextResponse.json(
        { error: "Không tìm thấy player (hoặc không có quyền cập nhật)." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      player: toPlayerRecord(data as Record<string, unknown>),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi cập nhật player";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
