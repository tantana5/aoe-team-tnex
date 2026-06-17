import { NextResponse } from "next/server";

const SHEET_ID = "1dlmPB-2zp4Woe3hCLGVZY3d-A-R4NWGJ634tANUu700";

// Parse a single CSV line respecting quoted fields
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  result.push(cur);
  return result;
}

export type Player = {
  name: string;
  score: number;
};

export async function GET() {
  try {
    // export CSV giữ nguyên vị trí cột (A,B,C,D,E...) nên cột D/E luôn đúng index.
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

    const res = await fetch(url, {
      // avoid caching so we always get fresh data
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TeamBalancer/1.0)",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Không đọc được Google Sheet (HTTP ${res.status}). Hãy đảm bảo sheet được chia sẻ ở chế độ "Bất kỳ ai có đường liên kết".` },
        { status: 502 }
      );
    }

    const csv = await res.text();
    const rows = csv.split(/\r?\n/).map(parseCsvLine);

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
    const msg = e instanceof Error ? e.message : "Lỗi không xác định";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
