"use client";

import { useEffect, useMemo, useState } from "react";
import type { MatchStore, SavedMatch } from "@/lib/types";
import StatBarChart, { type ChartDatum } from "../components/StatBarChart";

type PlayerStat = {
  name: string;
  played: number;
  wins: number;
  losses: number;
  winRate: number; // 0..1
};

export default function StatsPage() {
  const [matches, setMatches] = useState<SavedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"winRate" | "wins" | "played">(
    "winRate"
  );
  const [view, setView] = useState<"chart" | "table">("chart");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/matches");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi tải dữ liệu");
      const store = (data.store ?? []) as MatchStore;
      setMatches(store);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo<PlayerStat[]>(() => {
    const map = new Map<string, { played: number; wins: number }>();

    for (const m of matches) {
      // chỉ tính kèo đã có kết quả thắng/thua
      if (m.winner !== "A" && m.winner !== "B") continue;
      const winners = m.winner === "A" ? m.teamA : m.teamB;
      const losers = m.winner === "A" ? m.teamB : m.teamA;

      for (const p of winners) {
        const cur = map.get(p.name) ?? { played: 0, wins: 0 };
        cur.played += 1;
        cur.wins += 1;
        map.set(p.name, cur);
      }
      for (const p of losers) {
        const cur = map.get(p.name) ?? { played: 0, wins: 0 };
        cur.played += 1;
        map.set(p.name, cur);
      }
    }

    const list: PlayerStat[] = Array.from(map.entries()).map(
      ([name, s]) => ({
        name,
        played: s.played,
        wins: s.wins,
        losses: s.played - s.wins,
        winRate: s.played > 0 ? s.wins / s.played : 0,
      })
    );

    list.sort((a, b) => {
      if (sortBy === "wins") return b.wins - a.wins;
      if (sortBy === "played") return b.played - a.played;
      // winRate, tie-break theo số trận
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.played - a.played;
    });

    return list;
  }, [matches, sortBy]);

  const countedMatches = matches.filter(
    (m) => m.winner === "A" || m.winner === "B"
  ).length;

  // dữ liệu cho biểu đồ: cột vẽ theo tiêu chí đang sắp xếp
  const chartData = useMemo<ChartDatum[]>(() => {
    if (sortBy === "wins") {
      return stats.map((s) => ({
        label: s.name,
        value: s.wins,
        display: String(s.wins),
      }));
    }
    if (sortBy === "played") {
      return stats.map((s) => ({
        label: s.name,
        value: s.played,
        display: String(s.played),
      }));
    }
    // winRate
    return stats.map((s) => ({
      label: s.name,
      value: s.winRate * 100,
      display: `${Math.round(s.winRate * 100)}%`,
    }));
  }, [stats, sortBy]);

  const chartBarClass =
    sortBy === "wins"
      ? "bg-blue-500"
      : sortBy === "played"
      ? "bg-indigo-500"
      : "bg-emerald-500";

  const chartTitle =
    sortBy === "wins"
      ? "Số trận thắng"
      : sortBy === "played"
      ? "Số trận đã chơi"
      : "Tỷ lệ thắng";

  return (
    <main className="min-h-screen max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2 text-gray-900">📈 Thống kê</h1>
      <p className="text-gray-600 text-sm mb-6">
        Tỷ lệ thắng của từng game thủ, tính trên {countedMatches} kèo đã có kết
        quả.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <span className="text-sm text-gray-600">Sắp xếp theo:</span>
        <select
          value={sortBy}
          onChange={(e) =>
            setSortBy(e.target.value as "winRate" | "wins" | "played")
          }
          className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
        >
          <option value="winRate">Tỷ lệ thắng</option>
          <option value="wins">Số trận thắng</option>
          <option value="played">Số trận đã chơi</option>
        </select>
        <button
          onClick={load}
          className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm transition"
        >
          🔄 Tải lại
        </button>

        <div className="ml-auto inline-flex rounded-lg border border-gray-300 overflow-hidden">
          <button
            onClick={() => setView("chart")}
            className={`px-3 py-2 text-sm transition ${
              view === "chart"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            📊 Biểu đồ
          </button>
          <button
            onClick={() => setView("table")}
            className={`px-3 py-2 text-sm transition ${
              view === "table"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            📋 Bảng
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-300 text-red-700 text-sm">
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-10">Đang tải...</div>
      ) : stats.length === 0 ? (
        <div className="rounded-xl border border-gray-300 bg-white shadow-sm p-8 text-center text-gray-500">
          Chưa có kèo nào có kết quả để thống kê.
        </div>
      ) : view === "chart" ? (
        <div className="rounded-xl border border-gray-300 bg-white shadow-sm p-5">
          <div className="text-sm font-medium text-gray-700 mb-4">
            {chartTitle} theo game thủ
          </div>
          <StatBarChart data={chartData} barClassName={chartBarClass} />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-300 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="py-3 px-4 w-12">#</th>
                <th className="py-3 px-4">Game thủ</th>
                <th className="py-3 px-4 text-center">Trận</th>
                <th className="py-3 px-4 text-center">Thắng</th>
                <th className="py-3 px-4 text-center">Thua</th>
                <th className="py-3 px-4">Tỷ lệ thắng</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s, i) => (
                <tr
                  key={s.name}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                >
                  <td className="py-3 px-4 text-gray-400">{i + 1}</td>
                  <td className="py-3 px-4 font-medium text-gray-800">
                    {s.name}
                  </td>
                  <td className="py-3 px-4 text-center font-mono">
                    {s.played}
                  </td>
                  <td className="py-3 px-4 text-center font-mono text-emerald-600">
                    {s.wins}
                  </td>
                  <td className="py-3 px-4 text-center font-mono text-red-500">
                    {s.losses}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden min-w-[80px]">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${Math.round(s.winRate * 100)}%` }}
                        />
                      </div>
                      <span className="font-mono text-gray-700 w-12 text-right">
                        {Math.round(s.winRate * 100)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
