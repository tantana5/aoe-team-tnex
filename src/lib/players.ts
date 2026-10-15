import { parseNum } from "./csv";

/** Một dòng trong bảng `players` trên Supabase. */
export type PlayerRecord = {
  id: number;
  name: string;
  score: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type PlayerInput = { name: string; score: number };

/** Chuẩn hóa một dòng đọc từ Supabase (cột `point` kiểu real đã alias thành `score`). */
export function toPlayerRecord(row: Record<string, unknown>): PlayerRecord {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    score: Math.round(Number(row.score ?? 0) * 100) / 100,
    active: row.active !== false,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export const PLAYER_NAME_MAX = 50;
export const PLAYER_SCORE_MIN = -1000;
export const PLAYER_SCORE_MAX = 1000;
export const IMPORT_MAX_ROWS = 2000;

/** Bố cục file Excel cũ (không có tiêu đề): cột D = tên, cột E = điểm, dữ liệu từ dòng 3. */
const LEGACY_NAME_COL = 3;
const LEGACY_SCORE_COL = 4;
const LEGACY_START_ROW = 2;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Chuẩn hóa tên: trim, gộp khoảng trắng, chuẩn Unicode NFC (tránh trùng tên do bộ gõ). */
export function normalizeName(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

/** Đổi giá trị ô (số hoặc chuỗi "1,5") sang số; null nếu không hợp lệ. */
export function toScore(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") return parseNum(raw);
  return null;
}

export function validateName(raw: unknown): string | { error: string } {
  const name = normalizeName(raw);
  if (name === "") return { error: "Tên player không được để trống." };
  if (name.length > PLAYER_NAME_MAX)
    return { error: `Tên player tối đa ${PLAYER_NAME_MAX} ký tự.` };
  return name;
}

export function validateScore(raw: unknown): number | { error: string } {
  const score = toScore(raw);
  if (score === null) return { error: "Điểm phải là một số." };
  if (score < PLAYER_SCORE_MIN || score > PLAYER_SCORE_MAX)
    return {
      error: `Điểm phải nằm trong khoảng ${PLAYER_SCORE_MIN} đến ${PLAYER_SCORE_MAX}.`,
    };
  return round2(score);
}

const NAME_HEADERS = ["tên", "ten", "name", "player", "game thủ", "người chơi", "nick"];
const SCORE_HEADERS = ["điểm", "diem", "score", "rank", "elo", "rating"];

const cellText = (v: unknown) => normalizeName(v).toLowerCase();
const matchesHeader = (v: unknown, keys: string[]) => {
  const t = cellText(v);
  return t !== "" && keys.some((k) => t === k || t.startsWith(k + " "));
};

function collect(
  rows: unknown[][],
  nameCol: number,
  scoreCol: number,
  startRow: number
) {
  const byName = new Map<string, PlayerInput>();
  let skipped = 0;
  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const rawName = row[nameCol];
    const rawScore = row[scoreCol];
    if (normalizeName(rawName) === "" && normalizeName(rawScore) === "") continue;
    const name = validateName(rawName);
    const score = validateScore(rawScore);
    if (typeof name !== "string" || typeof score !== "number") {
      skipped++;
      continue;
    }
    if (byName.has(name)) skipped++; // trùng tên -> lấy dòng sau cùng
    byName.set(name, { name, score });
  }
  return { players: Array.from(byName.values()), skipped };
}

/**
 * Lấy danh sách player từ dữ liệu bảng tính (file Excel/CSV).
 * 1. Tìm dòng tiêu đề có cột "Tên" và "Điểm" (trong 10 dòng đầu).
 * 2. Không có tiêu đề -> dùng bố cục file cũ (cột D/E từ dòng 3).
 * 3. Vẫn không có dữ liệu -> thử cột A/B từ dòng 1.
 */
export function extractPlayers(rows: unknown[][]): {
  players: PlayerInput[];
  skipped: number;
} {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r] ?? [];
    const nameCol = row.findIndex((c) => matchesHeader(c, NAME_HEADERS));
    const scoreCol = row.findIndex((c) => matchesHeader(c, SCORE_HEADERS));
    if (nameCol >= 0 && scoreCol >= 0 && nameCol !== scoreCol) {
      return collect(rows, nameCol, scoreCol, r + 1);
    }
  }

  const legacy = collect(rows, LEGACY_NAME_COL, LEGACY_SCORE_COL, LEGACY_START_ROW);
  if (legacy.players.length > 0) return legacy;
  return collect(rows, 0, 1, 0);
}
