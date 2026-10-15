/**
 * Truy cập dữ liệu kèo đấu trên Supabase (chỉ dùng phía server).
 *
 * Vòng đời một kèo:
 * 1. Bấm "Chia team" -> lưu "kèo nháp" vào kho JSON (lib/draft.ts), KHÔNG ghi Supabase.
 * 2. Nhập tỷ số -> mới ghi vào Supabase đầy đủ:
 *    - `matches`: data (đội hình, chênh lệch, chấp quân, tỷ số...), team_1_point,
 *      team_2_point (tổng điểm), team_1_score, team_2_score (tỷ số)
 *    - `match_player_history`: 1 dòng / player (team 1|2, point = điểm lúc chia team)
 *    - `players.point`: cộng/trừ theo tỷ số (xem pointDeltaFor)
 * 3. Sửa tỷ số kèo đã lưu -> cập nhật Supabase, chỉ áp dụng phần chênh lệch điểm.
 *
 * Kèo cũ có thể không có đội hình trong `data` -> đọc đội hình từ `match_player_history`.
 * DB chưa có foreign key giữa các bảng nên phải tự ghép dữ liệu bằng match_id.
 */
import { buildResult, type Handicap, type Selected } from "./balance";
import { newDraftId, readDraft, writeDraft, type MatchDraft } from "./draft";
import { getSupabase, PLAYERS_TABLE, supabaseErrorMessage } from "./supabase";
import type { PlayerStat, SavedMatch } from "./types";

export const MATCHES_TABLE = "matches";
export const HISTORY_TABLE = "match_player_history";

const PAGE_SIZE = 1000; // giới hạn mặc định số dòng mỗi request của Supabase
const MAX_TEAM_SIZE = 8;
const MAX_WINS = 99;

type PointDelta = { team1: number; team2: number };

type MatchData = {
  /** đội hình kèo, điểm = điểm player lúc chia team */
  teamA?: Selected[];
  teamB?: Selected[];
  teamSize?: number;
  diff?: number;
  handicaps?: Handicap[];
  winsA?: number | null;
  winsB?: number | null;
  winner?: "A" | "B" | null;
  /** Điểm đã cộng/trừ cho MỖI player của từng đội theo tỷ số hiện tại (để sửa tỷ số không bị cộng 2 lần). */
  pointDelta?: PointDelta;
};

type MatchRow = {
  id: number;
  team_1_point: number | null;
  team_2_point: number | null;
  /** tỷ số ván thắng (smallint) */
  team_1_score: number | null;
  team_2_score: number | null;
  data: MatchData | null;
  created_at: string;
  updated_at: string | null;
};

type HistoryRow = {
  id: number;
  player_id: number | null;
  match_id: number;
  player_name: string | null;
  point: number | null;
  team: number;
  created_at: string;
};

type DbError = { code?: string; message: string };

/** Lỗi nghiệp vụ kèm HTTP status để route trả về. */
export class MatchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "MatchError";
    this.status = status;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const sumScore = (t: Selected[]) => round2(t.reduce((s, p) => s + p.score, 0));

function fail(error: DbError): never {
  throw new Error(supabaseErrorMessage(error));
}

/** Ngày (yyyy-mm-dd) theo giờ Việt Nam của một thời điểm ISO. */
export function vnDate(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function winnerOf(winsA: number | null, winsB: number | null): "A" | "B" | null {
  if (winsA === null || winsB === null) return null;
  if (winsA > winsB) return "A";
  if (winsB > winsA) return "B";
  return null;
}

/** Tỷ số của kèo: ưu tiên cột team_1_score/team_2_score, dữ liệu cũ thì lấy trong `data`. */
function scoresOf(row: Pick<MatchRow, "team_1_score" | "team_2_score" | "data">) {
  const d = row.data ?? {};
  const winsA = row.team_1_score ?? d.winsA ?? null;
  const winsB = row.team_2_score ?? d.winsB ?? null;
  return { winsA, winsB, winner: winnerOf(winsA, winsB) };
}

/**
 * Điểm cộng/trừ cho mỗi player theo tỷ số.
 * Đội thắng với số ván thắng <= 2: +0.1 mỗi người, đội thua -0.1.
 * Đội thắng với số ván thắng > 2: +0.2 mỗi người, đội thua -0.2.
 * Hòa hoặc chưa có tỷ số: không đổi.
 */
export function pointDeltaFor(winsA: number | null, winsB: number | null): PointDelta {
  const winner = winnerOf(winsA, winsB);
  if (!winner) return { team1: 0, team2: 0 };
  const step = Math.max(winsA!, winsB!) > 2 ? 0.2 : 0.1;
  return winner === "A" ? { team1: step, team2: -step } : { team1: -step, team2: step };
}

/** Đọc hết các dòng (tự phân trang theo PAGE_SIZE). */
async function fetchAll<T>(
  query: (
    from: number,
    to: number
  ) => PromiseLike<{ data: unknown[] | null; error: DbError | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) fail(error);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

const historyToSelected = (h: HistoryRow): Selected => ({
  id: h.player_id === null ? null : Number(h.player_id),
  name: h.player_name ?? "",
  score: round2(Number(h.point ?? 0)),
});

/** Đội hình của kèo: ưu tiên `data` (kèo mới), kèo cũ thì lấy từ match_player_history. */
function teamsOf(row: MatchRow, history: HistoryRow[]): { teamA: Selected[]; teamB: Selected[] } {
  const d = row.data ?? {};
  if (Array.isArray(d.teamA) && Array.isArray(d.teamB) && d.teamA.length > 0) {
    return { teamA: d.teamA, teamB: d.teamB };
  }
  const sorted = history.slice().sort((a, b) => a.id - b.id);
  return {
    teamA: sorted.filter((h) => h.team === 1).map(historyToSelected),
    teamB: sorted.filter((h) => h.team === 2).map(historyToSelected),
  };
}

function toSavedMatch(row: MatchRow, history: HistoryRow[]): SavedMatch | null {
  const { teamA, teamB } = teamsOf(row, history);
  if (teamA.length === 0 || teamB.length === 0) return null; // kèo ghi dở
  const d = row.data ?? {};
  const scoreA = row.team_1_point === null ? sumScore(teamA) : round2(Number(row.team_1_point));
  const scoreB = row.team_2_point === null ? sumScore(teamB) : round2(Number(row.team_2_point));
  const { winsA, winsB, winner } = scoresOf(row);
  const delta = d.pointDelta;

  return {
    id: Number(row.id),
    createdAt: row.created_at,
    matchDate: vnDate(row.created_at),
    teamSize: d.teamSize ?? Math.max(teamA.length, teamB.length),
    teamA,
    teamB,
    scoreA,
    scoreB,
    diff: d.diff ?? round2(Math.abs(scoreA - scoreB)),
    handicaps: d.handicaps ?? [],
    winsA,
    winsB,
    winner,
    pointDelta:
      delta && (delta.team1 !== 0 || delta.team2 !== 0)
        ? { A: delta.team1, B: delta.team2 }
        : null,
  };
}

function groupByMatch(history: HistoryRow[]): Map<number, HistoryRow[]> {
  const map = new Map<number, HistoryRow[]>();
  for (const h of history) {
    const id = Number(h.match_id);
    const list = map.get(id);
    if (list) list.push(h);
    else map.set(id, [h]);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

/** Toàn bộ kèo (cả kèo nháp), mới nhất trước. */
export async function listMatches(): Promise<SavedMatch[]> {
  const sb = getSupabase();
  const [rows, history] = await Promise.all([
    fetchAll<MatchRow>((from, to) =>
      sb
        .from(MATCHES_TABLE)
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to)
    ),
    fetchAll<HistoryRow>((from, to) =>
      sb.from(HISTORY_TABLE).select("*").order("id").range(from, to)
    ),
  ]);
  const byMatch = groupByMatch(history);
  return rows
    .map((r) => toSavedMatch(r, byMatch.get(Number(r.id)) ?? []))
    .filter((m): m is SavedMatch => m !== null);
}

async function readMatch(id: number): Promise<{ row: MatchRow; history: HistoryRow[] }> {
  const sb = getSupabase();
  const [{ data: row, error }, { data: history, error: hErr }] = await Promise.all([
    sb.from(MATCHES_TABLE).select("*").eq("id", id).maybeSingle(),
    sb.from(HISTORY_TABLE).select("*").eq("match_id", id),
  ]);
  if (error) fail(error);
  if (hErr) fail(hErr);
  if (!row) throw new MatchError("Không tìm thấy kèo đấu.", 404);
  return { row: row as MatchRow, history: (history ?? []) as HistoryRow[] };
}

async function getMatchOrThrow(id: number): Promise<SavedMatch> {
  const { row, history } = await readMatch(id);
  const m = toSavedMatch(row, history);
  if (!m) throw new MatchError("Kèo đấu không có dữ liệu đội hình.", 404);
  return m;
}

/** Kèo đã có tỷ số được tạo gần nhất trong Supabase. */
async function getLatestSavedMatch(): Promise<SavedMatch | null> {
  const sb = getSupabase();
  const { data: rows, error } = await sb
    .from(MATCHES_TABLE)
    .select("*")
    .not("team_1_score", "is", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(5);
  if (error) fail(error);
  if (!rows || rows.length === 0) return null;

  const ids = rows.map((r) => Number(r.id));
  const { data: history, error: hErr } = await sb
    .from(HISTORY_TABLE)
    .select("*")
    .in("match_id", ids);
  if (hErr) fail(hErr);
  const byMatch = groupByMatch((history ?? []) as HistoryRow[]);
  for (const r of rows as MatchRow[]) {
    const m = toSavedMatch(r, byMatch.get(Number(r.id)) ?? []);
    if (m) return m;
  }
  return null;
}

/** Kèo gần nhất: kèo nháp (kho JSON) hoặc kèo đã lưu (Supabase), cái nào mới hơn. */
export async function getLatestMatch(): Promise<SavedMatch | null> {
  const [draft, saved] = await Promise.all([readDraft(), getLatestSavedMatch()]);
  const draftMatch = draft && draft.savedId === undefined ? draftToSavedMatch(draft) : null;
  if (!draftMatch) return saved;
  if (!saved) return draftMatch;
  return draftMatch.createdAt >= saved.createdAt ? draftMatch : saved;
}

/** Tỷ lệ thắng của từng player, tính trên các kèo đã có người thắng (từ match_player_history). */
export async function getPlayerStats(): Promise<{
  stats: PlayerStat[];
  countedMatches: number;
}> {
  const sb = getSupabase();
  const [rows, history, players] = await Promise.all([
    fetchAll<Pick<MatchRow, "id" | "data" | "team_1_score" | "team_2_score">>((from, to) =>
      sb
        .from(MATCHES_TABLE)
        .select("id, data, team_1_score, team_2_score")
        .order("id")
        .range(from, to)
    ),
    fetchAll<HistoryRow>((from, to) =>
      sb.from(HISTORY_TABLE).select("*").order("id").range(from, to)
    ),
    fetchAll<{ id: number; name: string }>((from, to) =>
      sb.from(PLAYERS_TABLE).select("id, name").order("id").range(from, to)
    ),
  ]);

  const winnerByMatch = new Map<number, "A" | "B">();
  for (const r of rows) {
    const w = scoresOf(r).winner;
    if (w === "A" || w === "B") winnerByMatch.set(Number(r.id), w);
  }

  // gom theo player_id để đổi tên player không làm tách thống kê
  const currentName = new Map(players.map((p) => [Number(p.id), p.name]));
  const acc = new Map<string, { name: string; played: number; wins: number }>();
  const counted = new Set<number>();

  for (const h of history) {
    const matchId = Number(h.match_id);
    const winner = winnerByMatch.get(matchId);
    if (!winner) continue;
    counted.add(matchId);

    const pid = h.player_id === null ? null : Number(h.player_id);
    const key = pid !== null ? `id:${pid}` : `name:${h.player_name ?? ""}`;
    const name = (pid !== null && currentName.get(pid)) || h.player_name || "?";
    const cur = acc.get(key) ?? { name, played: 0, wins: 0 };
    cur.played += 1;
    if ((winner === "A" && h.team === 1) || (winner === "B" && h.team === 2)) {
      cur.wins += 1;
    }
    acc.set(key, cur);
  }

  const stats: PlayerStat[] = Array.from(acc.entries()).map(([key, s]) => ({
    key,
    name: s.name,
    played: s.played,
    wins: s.wins,
    losses: s.played - s.wins,
    winRate: s.played > 0 ? s.wins / s.played : 0,
  }));

  return { stats, countedMatches: counted.size };
}

// ---------------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------------

/** Kiểm tra danh sách id 2 đội gửi lên từ client. */
export function parseTeams(teamA: unknown, teamB: unknown): { a: number[]; b: number[] } {
  const isIds = (v: unknown): v is number[] =>
    Array.isArray(v) && v.every((x) => Number.isInteger(x) && x > 0);
  if (!isIds(teamA) || !isIds(teamB)) {
    throw new MatchError("Danh sách player của 2 đội không hợp lệ.", 400);
  }
  if (teamA.length === 0 || teamA.length !== teamB.length || teamA.length > MAX_TEAM_SIZE) {
    throw new MatchError("Hai đội phải có cùng số player (1-8 người).", 400);
  }
  if (new Set([...teamA, ...teamB]).size !== teamA.length * 2) {
    throw new MatchError("Một player không thể xuất hiện 2 lần.", 400);
  }
  return { a: teamA, b: teamB };
}

/** Dữ liệu đội hình + chênh lệch + chấp quân để ghi vào `data`. */
function lineupData(teamA: Selected[], teamB: Selected[]): MatchData {
  const r = buildResult(teamA, teamB);
  return { teamA, teamB, teamSize: teamA.length, diff: r.diff, handicaps: r.handicaps };
}

/** Đội hình theo id player, điểm lấy từ bảng players tại thời điểm gọi. */
async function loadLineup(
  teamAIds: number[],
  teamBIds: number[]
): Promise<{ teamA: Selected[]; teamB: Selected[] }> {
  const ids = [...teamAIds, ...teamBIds];
  const { data: players, error } = await getSupabase()
    .from(PLAYERS_TABLE)
    .select("id, name, point")
    .in("id", ids);
  if (error) fail(error);
  const byId = new Map<number, Selected>(
    (players ?? []).map((p) => [
      Number(p.id),
      { id: Number(p.id), name: String(p.name), score: round2(Number(p.point ?? 0)) },
    ])
  );
  if (ids.some((id) => !byId.has(id))) {
    throw new MatchError("Có player không còn tồn tại, hãy tải lại danh sách.", 409);
  }
  return {
    teamA: teamAIds.map((id) => byId.get(id)!),
    teamB: teamBIds.map((id) => byId.get(id)!),
  };
}

function draftToSavedMatch(draft: MatchDraft): SavedMatch {
  const r = buildResult(draft.teamA, draft.teamB);
  return {
    id: draft.id,
    isDraft: true,
    createdAt: draft.createdAt,
    matchDate: vnDate(draft.createdAt),
    teamSize: draft.teamA.length,
    teamA: draft.teamA,
    teamB: draft.teamB,
    scoreA: round2(r.scoreA),
    scoreB: round2(r.scoreB),
    diff: r.diff,
    handicaps: r.handicaps,
    winsA: null,
    winsB: null,
    winner: null,
    pointDelta: null,
  };
}

/** Bấm "Chia team": lưu kèo nháp vào kho JSON (KHÔNG ghi Supabase). */
export async function createDraft(teamAIds: number[], teamBIds: number[]): Promise<SavedMatch> {
  const { teamA, teamB } = await loadLineup(teamAIds, teamBIds);
  const draft: MatchDraft = {
    id: newDraftId(),
    createdAt: new Date().toISOString(),
    teamA,
    teamB,
  };
  await writeDraft(draft);
  return draftToSavedMatch(draft);
}

/**
 * "Chia cách khác": đổi đội trong kèo nháp (cùng thành phần player, giữ điểm lúc chia).
 * Nếu kèo nháp không còn (đã bị thay bằng kèo nháp khác / mất) thì tạo kèo nháp mới.
 */
export async function updateDraftTeams(
  id: string,
  teamAIds: number[],
  teamBIds: number[]
): Promise<SavedMatch> {
  const draft = await readDraft();
  if (!draft || draft.id !== id || draft.savedId !== undefined) {
    return createDraft(teamAIds, teamBIds);
  }

  const byId = new Map(
    [...draft.teamA, ...draft.teamB]
      .filter((p) => typeof p.id === "number")
      .map((p) => [p.id as number, p])
  );
  const ids = [...teamAIds, ...teamBIds];
  if (ids.length !== byId.size || ids.some((pid) => !byId.has(pid))) {
    return createDraft(teamAIds, teamBIds);
  }

  const next: MatchDraft = {
    ...draft,
    teamA: teamAIds.map((pid) => byId.get(pid)!),
    teamB: teamBIds.map((pid) => byId.get(pid)!),
  };
  await writeDraft(next);
  return draftToSavedMatch(next);
}

/**
 * Nhập tỷ số cho kèo nháp -> lúc này mới ghi vào Supabase:
 * tạo dòng `matches`, rồi dùng updateMatchScore để ghi match_player_history,
 * tỷ số, tổng điểm và cộng/trừ điểm player. Thành công thì xóa kèo nháp.
 *
 * `lineup` (id player 2 đội, client gửi kèm) dùng khi kho JSON không còn kèo nháp
 * (vd chạy serverless chưa cấu hình Blob) -> dựng lại đội hình với điểm hiện tại.
 */
export async function saveDraftScore(
  id: string,
  winsA: unknown,
  winsB: unknown,
  lineup?: { teamA: number[]; teamB: number[] }
): Promise<SavedMatch> {
  const { a, b } = parseScores(winsA, winsB);

  const stored = await readDraft();
  const isStored = !!stored && stored.id === id;
  let draft: MatchDraft;
  if (isStored) {
    draft = stored!;
  } else if (lineup) {
    const { teamA, teamB } = await loadLineup(lineup.teamA, lineup.teamB);
    draft = { id, createdAt: new Date().toISOString(), teamA, teamB };
  } else {
    throw new MatchError("Kèo nháp không còn, hãy bấm Chia team lại.", 404);
  }

  let matchId = draft.savedId;
  if (matchId === undefined) {
    const now = new Date().toISOString();
    const { data: inserted, error } = await getSupabase()
      .from(MATCHES_TABLE)
      .insert({
        data: { ...lineupData(draft.teamA, draft.teamB), winsA: null, winsB: null, winner: null },
        created_at: draft.createdAt, // ngày kèo = lúc chia team
        updated_at: now,
      })
      .select("id")
      .single();
    if (error) fail(error);
    matchId = Number(inserted.id);
    // ghi nhớ để nếu bước sau lỗi thì lần thử lại dùng tiếp kèo này, không tạo trùng
    if (isStored) await writeDraft({ ...draft, savedId: matchId });
  }

  const saved = await updateMatchScore(matchId, a, b);
  if (isStored) await writeDraft(null);
  return saved;
}

/**
 * Đổi cách chia đội của kèo nháp (cùng thành phần player, chỉ đổi đội).
 * Điểm từng player giữ nguyên như lúc tạo kèo.
 */
export async function updateMatchTeams(
  id: number,
  teamAIds: number[],
  teamBIds: number[]
): Promise<SavedMatch> {
  const sb = getSupabase();
  const { row, history } = await readMatch(id);
  if (scoresOf(row).winsA !== null) {
    throw new MatchError("Kèo đã có tỷ số, không thể đổi đội.", 409);
  }

  const current = teamsOf(row, history);
  const byId = new Map(
    [...current.teamA, ...current.teamB]
      .filter((p) => typeof p.id === "number")
      .map((p) => [p.id as number, p])
  );
  const ids = [...teamAIds, ...teamBIds];
  if (ids.length !== byId.size || ids.some((pid) => !byId.has(pid))) {
    throw new MatchError("Thành phần 2 đội khác với kèo đã lưu.", 409);
  }

  const teamA = teamAIds.map((pid) => byId.get(pid)!);
  const teamB = teamBIds.map((pid) => byId.get(pid)!);

  // kèo cũ đã có dòng match_player_history thì đổi đội luôn ở đó cho khớp
  if (history.length > 0) {
    const [u1, u2] = await Promise.all([
      sb.from(HISTORY_TABLE).update({ team: 1 }).eq("match_id", id).in("player_id", teamAIds),
      sb.from(HISTORY_TABLE).update({ team: 2 }).eq("match_id", id).in("player_id", teamBIds),
    ]);
    if (u1.error) fail(u1.error);
    if (u2.error) fail(u2.error);
  }

  const { error } = await sb
    .from(MATCHES_TABLE)
    .update({
      data: { ...row.data, ...lineupData(teamA, teamB) },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) fail(error);

  return getMatchOrThrow(id);
}

type PointChange = { playerId: number; delta: number };

/**
 * Cộng `delta` vào điểm của 1 player. Dùng optimistic concurrency (chỉ ghi nếu điểm
 * chưa bị ai đổi kể từ lúc đọc) để 2 lần cập nhật cùng lúc không ghi đè nhau.
 * Trả về false nếu player không còn tồn tại.
 */
async function addPlayerPoint(change: PointChange): Promise<boolean> {
  const sb = getSupabase();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await sb
      .from(PLAYERS_TABLE)
      .select("point")
      .eq("id", change.playerId)
      .maybeSingle();
    if (error) fail(error);
    if (!data) return false;

    const old = data.point === null ? null : Number(data.point);
    const next = round2((old ?? 0) + change.delta);
    const base = sb
      .from(PLAYERS_TABLE)
      .update({ point: next, updated_at: new Date().toISOString() })
      .eq("id", change.playerId);
    const { data: updated, error: uErr } = await (old === null
      ? base.is("point", null)
      : base.eq("point", old)
    ).select("id");
    if (uErr) fail(uErr);
    if (updated && updated.length > 0) return true;
  }
  throw new Error("Điểm player đang được cập nhật đồng thời, hãy thử lại.");
}

/** Áp dụng nhiều thay đổi điểm; lỗi giữa chừng thì hoàn tác các thay đổi đã ghi. */
async function applyPointChanges(changes: PointChange[]): Promise<PointChange[]> {
  const results = await Promise.allSettled(changes.map(addPlayerPoint));
  const applied = changes.filter(
    (_, i) =>
      results[i].status === "fulfilled" &&
      (results[i] as PromiseFulfilledResult<boolean>).value
  );
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) {
    await revertPointChanges(applied);
    throw failed.reason;
  }
  return applied;
}

async function revertPointChanges(applied: PointChange[]): Promise<void> {
  await Promise.allSettled(
    applied.map((c) => addPlayerPoint({ playerId: c.playerId, delta: -c.delta }))
  );
}

function parseScores(winsA: unknown, winsB: unknown): { a: number; b: number } {
  const valid = (v: unknown): v is number =>
    Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_WINS;
  if (!valid(winsA) || !valid(winsB)) {
    throw new MatchError(`Tỷ số phải là số nguyên 0-${MAX_WINS} cho cả 2 đội.`, 400);
  }
  return { a: winsA, b: winsB };
}

/** Xóa các dòng history vừa thêm khi lưu tỷ số thất bại (cố gắng, bỏ qua lỗi). */
async function deleteHistoryRows(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await getSupabase().from(HISTORY_TABLE).delete().in("id", ids);
}

/**
 * Nhập/sửa tỷ số. Đây là lúc kèo được ghi đầy đủ vào Supabase:
 * - Lần đầu: thêm các dòng match_player_history từ đội hình trong `data`.
 * - Ghi team_1_point/team_2_point, team_1_score/team_2_score.
 * - Cộng/trừ điểm player theo pointDeltaFor(). Phần đã áp dụng trước đó lưu trong
 *   data.pointDelta, nên sửa tỷ số chỉ áp dụng phần chênh lệch (không cộng 2 lần).
 * - Cập nhật lại `data` (tỷ số, đội thắng, pointDelta).
 */
export async function updateMatchScore(
  id: number,
  winsA: unknown,
  winsB: unknown
): Promise<SavedMatch> {
  const { a, b } = parseScores(winsA, winsB);

  const sb = getSupabase();
  const { row, history } = await readMatch(id);
  const { teamA, teamB } = teamsOf(row, history);
  if (teamA.length === 0 || teamB.length === 0) {
    throw new MatchError("Kèo đấu không có dữ liệu đội hình.", 409);
  }

  // 1. lần đầu nhập tỷ số -> ghi lịch sử từng player
  let insertedHistoryIds: number[] = [];
  if (history.length === 0) {
    const now = new Date().toISOString();
    const rows = [
      ...teamA.map((p) => ({ team: 1, p })),
      ...teamB.map((p) => ({ team: 2, p })),
    ].map(({ team, p }) => ({
      match_id: id,
      player_id: p.id ?? null,
      player_name: p.name,
      point: p.score,
      team,
      created_at: now,
    }));
    const { data: inserted, error: hErr } = await sb.from(HISTORY_TABLE).insert(rows).select("id");
    if (hErr) fail(hErr);
    insertedHistoryIds = (inserted ?? []).map((h) => Number(h.id));
  }

  // 2. cộng/trừ điểm player (chỉ phần chênh lệch so với lần nhập trước)
  const prev = row.data?.pointDelta ?? { team1: 0, team2: 0 };
  const next = pointDeltaFor(a, b);
  const diff1 = round2(next.team1 - prev.team1);
  const diff2 = round2(next.team2 - prev.team2);
  const changes: PointChange[] = [
    ...teamA.map((p) => ({ id: p.id, delta: diff1 })),
    ...teamB.map((p) => ({ id: p.id, delta: diff2 })),
  ]
    .filter((c): c is { id: number; delta: number } => typeof c.id === "number" && c.delta !== 0)
    .map((c) => ({ playerId: c.id, delta: c.delta }));

  let applied: PointChange[] = [];
  try {
    applied = await applyPointChanges(changes);
  } catch (e) {
    await deleteHistoryRows(insertedHistoryIds);
    throw e;
  }

  // 3. ghi kèo; chỉ ghi nếu kèo chưa bị ai sửa kể từ lúc đọc
  //    (tránh 2 lần cập nhật cùng lúc cùng cộng điểm)
  const base = sb
    .from(MATCHES_TABLE)
    .update({
      team_1_point: sumScore(teamA),
      team_2_point: sumScore(teamB),
      team_1_score: a,
      team_2_score: b,
      data: { ...row.data, winsA: a, winsB: b, winner: winnerOf(a, b), pointDelta: next },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  const { data: written, error } = await (row.updated_at === null
    ? base.is("updated_at", null)
    : base.eq("updated_at", row.updated_at)
  ).select("id");
  if (error || !written || written.length === 0) {
    // không ghi được kèo -> hoàn tác để lần sau không bị cộng 2 lần / trùng lịch sử
    await revertPointChanges(applied);
    await deleteHistoryRows(insertedHistoryIds);
    if (error) fail(error);
    throw new MatchError("Kèo vừa được cập nhật ở nơi khác, hãy tải lại rồi thử lại.", 409);
  }

  return getMatchOrThrow(id);
}
