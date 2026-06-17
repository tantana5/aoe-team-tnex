import type { Handicap, Selected } from "./balance";

export type SavedMatch = {
  id: string;
  createdAt: string; // ISO datetime
  matchDate: string; // ngày diễn ra kèo (yyyy-mm-dd), do người dùng nhập
  teamSize: number;
  teamA: Selected[];
  teamB: Selected[];
  scoreA: number;
  scoreB: number;
  diff: number;
  handicaps: Handicap[];
  // kết quả trận (cập nhật sau): "A" | "B" | null (chưa có)
  winner?: "A" | "B" | null;
  // tỷ số ván thắng của mỗi đội (null = chưa cập nhật)
  winsA?: number | null;
  winsB?: number | null;
};

// Toàn bộ dữ liệu: danh sách phẳng các kèo (mỗi item đã có matchDate riêng).
// Mỗi ngày chỉ giữ lại MAX_MATCHES_PER_DAY kèo mới nhất (ghi đè kèo cũ).
export type MatchStore = SavedMatch[];

export const MAX_MATCHES_PER_DAY = 1;
