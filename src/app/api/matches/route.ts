import { NextRequest, NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";
import { MAX_MATCHES_PER_DAY, type SavedMatch } from "@/lib/types";
import { rosterKey } from "@/lib/match";

export const dynamic = "force-dynamic";

// Ngày theo múi giờ Việt Nam (yyyy-mm-dd)
function todayKeyVN(): string {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vn.toISOString().slice(0, 10);
}

// ID dạng yyyymmdd-hhMMss theo giờ Việt Nam
function matchIdVN(): string {
  const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const iso = vn.toISOString(); // yyyy-mm-ddTHH:MM:SS.sssZ
  const date = iso.slice(0, 10).replace(/-/g, "");
  const time = iso.slice(11, 19).replace(/:/g, "");
  return `${date}-${time}`;
}

export async function GET() {
  try {
    const store = await readStore();
    return NextResponse.json({ store });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi đọc dữ liệu";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<SavedMatch>;

    if (!body.teamA || !body.teamB) {
      return NextResponse.json(
        { error: "Thiếu dữ liệu đội" },
        { status: 400 }
      );
    }

    const store = await readStore();
    // ngày của kèo: ưu tiên matchDate người dùng nhập, mặc định hôm nay (giờ VN)
    const dayKey =
      body.matchDate && /^\d{4}-\d{2}-\d{2}$/.test(body.matchDate)
        ? body.matchDate
        : todayKeyVN();

    // Nếu ngày đó đã có kèo cùng thành phần 2 đội thì ghi đè (xóa kèo cũ).
    const newKey = rosterKey(body.teamA, body.teamB);
    const filtered = store.filter(
      (m) =>
        !(m.matchDate === dayKey && rosterKey(m.teamA, m.teamB) === newKey)
    );

    const winsA = body.winsA ?? null;
    const winsB = body.winsB ?? null;

    const match: SavedMatch = {
      id: matchIdVN(),
      createdAt: new Date().toISOString(),
      matchDate: dayKey,
      teamSize: body.teamSize ?? body.teamA.length,
      teamA: body.teamA,
      teamB: body.teamB,
      scoreA: body.scoreA ?? 0,
      scoreB: body.scoreB ?? 0,
      diff: body.diff ?? 0,
      handicaps: body.handicaps ?? [],
      winner: winsA === null || winsB === null
        ? null
        : winsA > winsB
        ? "A"
        : winsB > winsA
        ? "B"
        : null,
      winsA,
      winsB,
    };

    // Chỉ giữ lại MAX_MATCHES_PER_DAY kèo mới nhất trong cùng một ngày.
    const sameDay = filtered.filter((m) => m.matchDate === dayKey);
    const others = filtered.filter((m) => m.matchDate !== dayKey);
    const keptSameDay = [...sameDay, match].slice(-MAX_MATCHES_PER_DAY);
    const nextStore = [...others, ...keptSameDay];
    await writeStore(nextStore);

    return NextResponse.json({
      match,
      kept: keptSameDay.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi lưu dữ liệu";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Cập nhật tỷ số cho một kèo theo id.
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string;
      winsA?: number | null;
      winsB?: number | null;
    };

    if (!body.id) {
      return NextResponse.json({ error: "Thiếu id kèo" }, { status: 400 });
    }

    const store = await readStore();
    let updated: SavedMatch | null = null;

    const idx = store.findIndex((m) => m.id === body.id);
    if (idx !== -1) {
      const winsA = body.winsA ?? null;
      const winsB = body.winsB ?? null;
      const winner: "A" | "B" | null =
        winsA === null || winsB === null
          ? null
          : winsA > winsB
          ? "A"
          : winsB > winsA
          ? "B"
          : null;
      store[idx] = { ...store[idx], winsA, winsB, winner };
      updated = store[idx];
    }

    if (!updated) {
      return NextResponse.json(
        { error: "Không tìm thấy kèo đấu" },
        { status: 404 }
      );
    }

    await writeStore(store);
    return NextResponse.json({ match: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi cập nhật dữ liệu";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
