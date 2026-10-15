import type { Handicap, Selected } from "./balance";

/**
 * Một kèo đấu.
 * - Kèo nháp (isDraft): vừa chia team, chưa có tỷ số, chỉ nằm trong kho JSON (id dạng "draft-...").
 * - Kèo đã lưu: có tỷ số, nằm trong Supabase (`matches` + `match_player_history`), id là số.
 */
export type SavedMatch = {
  id: number | string;
  isDraft?: boolean;
  createdAt: string; // ISO datetime
  matchDate: string; // ngày diễn ra kèo theo giờ VN (yyyy-mm-dd), suy ra từ createdAt
  teamSize: number;
  teamA: Selected[];
  teamB: Selected[];
  scoreA: number;
  scoreB: number;
  diff: number;
  handicaps: Handicap[];
  // kết quả trận: "A" | "B" | null (chưa có / hòa)
  winner: "A" | "B" | null;
  // tỷ số ván thắng của mỗi đội (null = chưa cập nhật)
  winsA: number | null;
  winsB: number | null;
  // điểm đã cộng/trừ cho mỗi player của từng đội theo tỷ số (null = chưa có thay đổi)
  pointDelta: { A: number; B: number } | null;
};

/** Thống kê thắng/thua của một player. */
export type PlayerStat = {
  key: string; // player_id, hoặc tên nếu dữ liệu không có id
  name: string;
  played: number;
  wins: number;
  losses: number;
  winRate: number; // 0..1
};
