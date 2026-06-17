export type Selected = {
  name: string;
  score: number;
};

export type Handicap = {
  name: string;
  team: "A" | "B";
  civ: "Shang" | "Assyrian";
};

export type BalanceResult = {
  teamA: Selected[];
  teamB: Selected[];
  scoreA: number;
  scoreB: number;
  diff: number;
  handicaps: Handicap[];
};

/** Dựng kết quả (điểm, chênh lệch, chấp quân) cho một cách chia cụ thể. */
function buildResult(teamA: Selected[], teamB: Selected[]): BalanceResult {
  const scoreA = teamA.reduce((s, p) => s + p.score, 0);
  const scoreB = teamB.reduce((s, p) => s + p.score, 0);
  const diff = Math.round(Math.abs(scoreA - scoreB) * 100) / 100;

  // Chấp quân cho đội yếu hơn (tổng điểm thấp hơn), ưu tiên từ người yếu nhất.
  // Mỗi 1.0 điểm chênh lệch => thêm 1 người cầm Shang.
  // Phần lẻ còn lại >= 0.5 => người tiếp theo cầm Assyrian.
  // VD: lệch 1.5 -> 1 Shang + 1 Assyrian; lệch 2.5 -> 2 Shang + 1 Assyrian.
  const handicaps: Handicap[] = [];
  if (diff >= 0.5) {
    const weakerTeam: "A" | "B" = scoreA < scoreB ? "A" : "B";
    const roster = (weakerTeam === "A" ? teamA : teamB)
      .slice()
      .sort((a, b) => a.score - b.score); // yếu nhất trước

    const shangCount = Math.floor(diff);
    const remainder = diff - shangCount;
    const assyrianCount = remainder >= 0.5 ? 1 : 0;

    let idx = 0;
    for (let s = 0; s < shangCount && idx < roster.length; s++, idx++) {
      handicaps.push({ name: roster[idx].name, team: weakerTeam, civ: "Shang" });
    }
    for (let a = 0; a < assyrianCount && idx < roster.length; a++, idx++) {
      handicaps.push({
        name: roster[idx].name,
        team: weakerTeam,
        civ: "Assyrian",
      });
    }
  }

  return { teamA, teamB, scoreA, scoreB, diff, handicaps };
}

/**
 * Liệt kê TẤT CẢ các cách chia 2 đội bằng nhau, xếp theo chênh lệch tăng dần.
 * Game thủ đầu tiên luôn thuộc Đội 1 để tránh phương án trùng (đảo gương A/B).
 */
export function allBalancedSplits(players: Selected[]): BalanceResult[] {
  const n = players.length;
  if (n < 2 || n % 2 !== 0) return [];

  const half = n / 2;
  const results: BalanceResult[] = [];
  const combo: number[] = [];

  const choose = (start: number) => {
    if (combo.length === half) {
      // cố định phần tử 0 ở Đội 1 để loại bỏ bản gương
      if (!combo.includes(0)) return;
      const setA = new Set(combo);
      const teamA: Selected[] = [];
      const teamB: Selected[] = [];
      players.forEach((p, i) => (setA.has(i) ? teamA : teamB).push(p));
      results.push(buildResult(teamA, teamB));
      return;
    }
    for (let i = start; i < n; i++) {
      combo.push(i);
      choose(i + 1);
      combo.pop();
    }
  };

  choose(0);

  results.sort((a, b) => a.diff - b.diff);
  return results;
}

/**
 * Cách chia cân bằng nhất (chênh lệch nhỏ nhất).
 */
export function balanceTeams(players: Selected[]): BalanceResult | null {
  const all = allBalancedSplits(players);
  return all.length > 0 ? all[0] : null;
}
