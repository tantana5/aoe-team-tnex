import { NextRequest, NextResponse } from "next/server";
import { getSupabase, PLAYERS_TABLE, supabaseErrorMessage } from "@/lib/supabase";
import {
  IMPORT_MAX_ROWS,
  normalizeName,
  validateName,
  validateScore,
  type PlayerInput,
} from "@/lib/players";

export const dynamic = "force-dynamic";

/**
 * POST /api/players/import
 * { players: [{ name, score }] } -> import từ file Excel/CSV (đã đọc ở client)
 *
 * Player đã có (trùng tên) được cập nhật điểm, giữ nguyên trạng thái bật/tắt.
 * Player mới được thêm với trạng thái bật.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      players?: unknown;
    } | null;
    if (!body) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    let items: PlayerInput[] = [];
    let invalid = 0;

    if (Array.isArray(body.players)) {
      if (body.players.length > IMPORT_MAX_ROWS) {
        return NextResponse.json(
          { error: `Tối đa ${IMPORT_MAX_ROWS} player mỗi lần import.` },
          { status: 413 }
        );
      }
      const byName = new Map<string, PlayerInput>();
      for (const raw of body.players as { name?: unknown; score?: unknown }[]) {
        const name = validateName(raw?.name);
        const score = validateScore(raw?.score);
        if (typeof name !== "string" || typeof score !== "number") {
          invalid++;
          continue;
        }
        byName.set(name, { name, score });
      }
      items = Array.from(byName.values());
    } else {
      return NextResponse.json(
        { error: "Thiếu danh sách player cần import" },
        { status: 400 }
      );
    }

    if (items.length === 0) {
      return NextResponse.json(
        { error: "Không có player hợp lệ nào để import." },
        { status: 422 }
      );
    }

    const sb = getSupabase();
    const { data: existing, error: readErr } = await sb
      .from(PLAYERS_TABLE)
      .select("id, name, point");
    if (readErr) throw new Error(supabaseErrorMessage(readErr));

    // name -> player hiện có (DB không có unique constraint trên name nên không dùng upsert)
    const byName = new Map<string, { id: number; point: number }>();
    for (const p of existing ?? []) {
      const key = normalizeName(p.name);
      if (!byName.has(key)) byName.set(key, { id: Number(p.id), point: Number(p.point) });
    }

    const now = new Date().toISOString();
    const toInsert = items.filter((p) => !byName.has(p.name));
    // chỉ cập nhật player có điểm thay đổi (float4 -> so sánh sau khi làm tròn)
    const toUpdate = items
      .filter((p) => byName.has(p.name))
      .map((p) => ({ ...p, id: byName.get(p.name)!.id, old: byName.get(p.name)!.point }))
      .filter((p) => Math.round(p.old * 100) !== Math.round(p.score * 100));

    if (toInsert.length > 0) {
      const { error } = await sb.from(PLAYERS_TABLE).insert(
        toInsert.map((p) => ({ name: p.name, point: p.score, is_enable: true }))
      );
      if (error) throw new Error(supabaseErrorMessage(error));
    }

    // cập nhật theo lô nhỏ để không bắn quá nhiều request cùng lúc
    let updated = 0;
    for (let i = 0; i < toUpdate.length; i += 10) {
      const results = await Promise.all(
        toUpdate.slice(i, i + 10).map((p) =>
          sb
            .from(PLAYERS_TABLE)
            .update({ point: p.score, updated_at: now })
            .eq("id", p.id)
            .select("id")
        )
      );
      for (const r of results) {
        if (r.error) throw new Error(supabaseErrorMessage(r.error));
        updated += r.data?.length ?? 0;
      }
    }

    return NextResponse.json({
      inserted: toInsert.length,
      updated,
      unchanged: items.length - toInsert.length - toUpdate.length,
      invalid,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi import player";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
