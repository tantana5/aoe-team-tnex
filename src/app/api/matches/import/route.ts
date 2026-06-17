import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";
import { parseNum } from "@/lib/csv";
import { fetchSheetRows, SheetFetchError } from "@/lib/sheet";
import type { MatchStore, SavedMatch } from "@/lib/types";
import type { Selected } from "@/lib/balance";

export const dynamic = "force-dynamic";

// Cấu trúc cột trong sheet (cùng nguồn dữ liệu với /api/players):
const NAME_COL = 3; // cột D = tên game thủ
const RATING_COL = 4; // cột E = điểm rank
const PLAYER_START_ROW = 2; // dữ liệu game thủ bắt đầu từ dòng 3 (index 2)
const DATE_ROW = 1; // ngày của mỗi kèo nằm ở dòng 2 (index 1)

/** Đổi tên cột Excel (vd "FK") sang index 0-based. */
function colToIndex(col: string): number {
  let n = 0;
  for (const c of col.toUpperCase()) {
    n = n * 26 + (c.charCodeAt(0) - 64);
  }
  return n - 1;
}

const MATCH_START_COL = colToIndex("FK"); // FK = cột bắt đầu vùng ngày
const MATCH_END_COL = colToIndex("MD"); // MD = cột kết thúc vùng ngày (bao gồm)

const pad2 = (n: number) => String(n).padStart(2, "0");
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function POST() {
  try {
    const rows = await fetchSheetRows();

    // Danh sách game thủ kèm điểm rank và chỉ số dòng tương ứng.
    const players: { row: number; name: string; rating: number }[] = [];
    for (let r = PLAYER_START_ROW; r < rows.length; r++) {
      const name = (rows[r]?.[NAME_COL] ?? "").trim();
      if (name === "") continue;
      const rating = parseNum(rows[r]?.[RATING_COL] ?? "");
      players.push({ row: r, name, rating: rating ?? 0 });
    }

    if (players.length === 0) {
      return NextResponse.json(
        { error: "Không tìm thấy game thủ nào trong sheet (cột D)." },
        { status: 422 }
      );
    }

    const maxCol = rows.reduce((m, row) => Math.max(m, row.length), 0);
    const lastCol = Math.min(MATCH_END_COL, maxCol - 1);
    const dateRow = rows[DATE_ROW] ?? [];

    // không ghi đè: bắt đầu từ dữ liệu hiện có, ngày nào đã có kèo thì bỏ qua
    const store: MatchStore = await readStore();
    const existingDays = new Set(store.map((m) => m.matchDate));
    let imported = 0;
    let skipped = 0;
    let seq = 0;

    for (let c = MATCH_START_COL; c <= lastCol; c++) {
      const dateRaw = (dateRow[c] ?? "").trim();
      if (dateRaw === "") continue; // cột rỗng -> bỏ qua

      // định dạng ngày: dd/mm/YYYY (chấp nhận / - .)
      const m = dateRaw.match(/^(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})$/);
      if (!m) continue; // không format được ô ngày -> bỏ qua
      const day = Number(m[1]);
      const month = Number(m[2]);
      const year = Number(m[3]);
      if (!day || !month || month > 12 || day > 31) continue;
      const matchDate = `${year}-${pad2(month)}-${pad2(day)}`;

      // ngày này đã có kèo -> bỏ qua, không ghi đè
      if (existingDays.has(matchDate)) {
        skipped++;
        continue;
      }

      // điểm số từng game thủ trong cột này
      const winners: Selected[] = [];
      const losers: Selected[] = [];
      let mag = 0;
      for (const p of players) {
        const val = parseNum(rows[p.row]?.[c] ?? "");
        if (val === null || val === 0) continue; // ô rỗng/không rõ -> bỏ qua
        const sel: Selected = { name: p.name, score: round2(p.rating) };
        if (val > 0) winners.push(sel);
        else losers.push(sel);
        mag = Math.max(mag, Math.round(Math.abs(val) * 10));
      }

      // cần đủ 2 đội mới tính là một kèo hợp lệ
      if (winners.length === 0 || losers.length === 0) continue;

      // 0.1 -> 2-1, 0.2 -> 3-1, ... đội thua luôn được 1 ván
      const winsWinner = mag + 1;
      const winsLoser = 1;

      // gán ngẫu nhiên đội thắng vào A hoặc B (không phải cứ A là thắng)
      const winnerOnA = Math.random() < 0.5;
      const teamA = winnerOnA ? winners : losers;
      const teamB = winnerOnA ? losers : winners;
      const winner: "A" | "B" = winnerOnA ? "A" : "B";
      const winsA = winnerOnA ? winsWinner : winsLoser;
      const winsB = winnerOnA ? winsLoser : winsWinner;

      const scoreA = round2(teamA.reduce((s, p) => s + p.score, 0));
      const scoreB = round2(teamB.reduce((s, p) => s + p.score, 0));

      const match: SavedMatch = {
        id: `import-${matchDate}-${seq}`,
        createdAt: new Date(
          Date.parse(`${matchDate}T00:00:00Z`) + seq * 1000
        ).toISOString(),
        matchDate,
        teamSize: Math.max(winners.length, losers.length),
        teamA,
        teamB,
        scoreA,
        scoreB,
        diff: round2(Math.abs(scoreA - scoreB)),
        handicaps: [],
        winner,
        winsA,
        winsB,
      };

      store.push(match);
      existingDays.add(matchDate);
      imported++;
      seq++;
    }

    await writeStore(store);

    return NextResponse.json({
      imported,
      skipped,
      days: new Set(store.map((m) => m.matchDate)).size,
    });
  } catch (e) {
    if (e instanceof SheetFetchError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Lỗi import dữ liệu";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
