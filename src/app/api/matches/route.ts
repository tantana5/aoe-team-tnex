import { NextRequest, NextResponse } from "next/server";
import { isDraftId } from "@/lib/draft";
import {
  createDraft,
  listMatches,
  MatchError,
  parseTeams,
  saveDraftScore,
  updateDraftTeams,
  updateMatchScore,
  updateMatchTeams,
} from "@/lib/matches";

export const dynamic = "force-dynamic";

function errorResponse(e: unknown, fallback: string) {
  if (e instanceof MatchError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const msg = e instanceof Error ? e.message : fallback;
  return NextResponse.json({ error: msg }, { status: 500 });
}

/** GET /api/matches -> các kèo đã lưu trong Supabase, mới nhất trước. */
export async function GET() {
  try {
    return NextResponse.json({ matches: await listMatches() });
  } catch (e) {
    return errorResponse(e, "Lỗi đọc dữ liệu");
  }
}

/**
 * POST /api/matches { teamA: number[], teamB: number[] } (id player)
 * -> tạo kèo nháp trong kho JSON, chưa ghi Supabase.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      teamA?: unknown;
      teamB?: unknown;
    } | null;
    const { a, b } = parseTeams(body?.teamA, body?.teamB);
    const match = await createDraft(a, b);
    return NextResponse.json({ match }, { status: 201 });
  } catch (e) {
    return errorResponse(e, "Lỗi lưu kèo nháp");
  }
}

/**
 * PATCH /api/matches
 * - { id, teamA, teamB }            -> đổi cách chia đội (kèo nháp)
 * - { id, winsA, winsB, lineup? }   -> nhập/sửa tỷ số. Với kèo nháp, đây là lúc ghi vào Supabase.
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      id?: unknown;
      winsA?: unknown;
      winsB?: unknown;
      teamA?: unknown;
      teamB?: unknown;
      lineup?: { teamA?: unknown; teamB?: unknown };
    } | null;
    if (!body) {
      return NextResponse.json({ error: "Thiếu id kèo" }, { status: 400 });
    }

    const changeTeams = body.teamA !== undefined || body.teamB !== undefined;

    // kèo nháp (kho JSON)
    if (isDraftId(body.id)) {
      if (changeTeams) {
        const { a, b } = parseTeams(body.teamA, body.teamB);
        return NextResponse.json({ match: await updateDraftTeams(body.id, a, b) });
      }
      let lineup: { teamA: number[]; teamB: number[] } | undefined;
      if (body.lineup) {
        const { a, b } = parseTeams(body.lineup.teamA, body.lineup.teamB);
        lineup = { teamA: a, teamB: b };
      }
      const match = await saveDraftScore(body.id, body.winsA, body.winsB, lineup);
      return NextResponse.json({ match });
    }

    // kèo đã lưu (Supabase)
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Thiếu id kèo" }, { status: 400 });
    }
    if (changeTeams) {
      const { a, b } = parseTeams(body.teamA, body.teamB);
      return NextResponse.json({ match: await updateMatchTeams(id, a, b) });
    }
    return NextResponse.json({ match: await updateMatchScore(id, body.winsA, body.winsB) });
  } catch (e) {
    return errorResponse(e, "Lỗi cập nhật kèo đấu");
  }
}
