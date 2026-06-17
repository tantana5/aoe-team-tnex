import { NextResponse } from "next/server";
import { fetchSheetRows, SheetFetchError } from "@/lib/sheet";

export type Player = {
  name: string;
  score: number;
};

export async function GET() {
  try {
    const rows = await fetchSheetRows();

    // Cột D = index 3 (tên), cột E = index 4 (điểm).
    // Dữ liệu bắt đầu từ dòng 3 => index 2 trở xuống.
    const NAME_COL = 3;
    const SCORE_COL = 4;
    const START_ROW = 2;

    const players: Player[] = [];

    for (let r = START_ROW; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;

      const name = (row[NAME_COL] ?? "").trim();
      const rawScore = (row[SCORE_COL] ?? "").trim();
      if (name === "") continue;

      const score = Number(rawScore.replace(",", "."));
      if (rawScore === "" || Number.isNaN(score)) continue;

      players.push({ name, score });
    }

    return NextResponse.json({ players });
  } catch (e: unknown) {
    if (e instanceof SheetFetchError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Lỗi không xác định";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
