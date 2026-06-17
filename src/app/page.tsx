"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { allBalancedSplits, type BalanceResult, type Selected } from "@/lib/balance";

type Player = { name: string; score: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Custom searchable dropdown for picking a player. */
function PlayerSearchSelect({
  players,
  value,
  disabledNames,
  onChange,
}: {
  players: Player[];
  value: string;
  disabledNames: Set<string>;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? players.filter((p) => p.name.toLowerCase().includes(q))
      : players;
    return list;
  }, [players, query]);

  // danh sách các option có thể chọn bằng phím (loại bỏ những tên đã disabled)
  const selectable = useMemo(
    () => filtered.filter((p) => !(disabledNames.has(p.name) && p.name !== value)),
    [filtered, disabledNames, value]
  );

  // reset highlight khi mở hoặc khi từ khóa thay đổi
  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  // cuộn option đang highlight vào tầm nhìn
  useEffect(() => {
    if (!open) return;
    const el = optionRefs.current[highlight];
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const commit = (name: string) => {
    onChange(name);
    setOpen(false);
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === "ArrowDown") {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, selectable.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = selectable[highlight];
      if (pick) commit(pick.name);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  };

  const selectedScore = players.find((p) => p.name === value)?.score;

  return (
    <div className="relative flex-1" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        className="w-full text-left bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 flex justify-between items-center shadow-sm"
      >
        <span className={value ? "" : "text-gray-400"}>
          {value ? `${value} (${selectedScore})` : "— Chọn game thủ —"}
        </span>
        <span className="text-gray-400 text-xs">▼</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-xl max-h-72 overflow-hidden flex flex-col">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="🔍 Tìm tên... (↑↓ chọn, Enter xác nhận)"
            className="m-2 px-2 py-1.5 bg-gray-50 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-400"
          />
          <div className="overflow-y-auto">
            {value && (
              <div
                onClick={() => commit("")}
                className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 cursor-pointer"
              >
                ✖ Bỏ chọn
              </div>
            )}
            {selectable.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-400">
                Không tìm thấy
              </div>
            )}
            {selectable.map((p, i) => (
              <div
                key={p.name}
                ref={(el) => {
                  optionRefs.current[i] = el;
                }}
                onClick={() => commit(p.name)}
                onMouseEnter={() => setHighlight(i)}
                className={`px-3 py-2 text-sm flex justify-between cursor-pointer ${
                  i === highlight ? "bg-blue-100" : "hover:bg-blue-50"
                } ${p.name === value ? "font-semibold" : ""}`}
              >
                <span>{p.name}</span>
                <span className="font-mono text-gray-500">{p.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [teamSize, setTeamSize] = useState(4); // 2,3,4
  // slots: [0..teamSize-1] = team A, next block = team B
  const [slots, setSlots] = useState<string[]>(Array(8).fill(""));
  const [splits, setSplits] = useState<BalanceResult[]>([]);
  const [splitIdx, setSplitIdx] = useState(0);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const result = splits[splitIdx] ?? null;

  const fetchPlayers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/players");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi tải dữ liệu");
      setPlayers(data.players || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();
  }, []);

  const scoreOf = (name: string) =>
    players.find((p) => p.name === name)?.score ?? null;

  const setSlot = (idx: number, name: string) => {
    setSlots((prev) => {
      const next = [...prev];
      next[idx] = name;
      return next;
    });
    setSplits([]);
    setSplitIdx(0);
  };

  const changeTeamSize = (size: number) => {
    setTeamSize(size);
    setSlots(Array(size * 2).fill(""));
    setSplits([]);
    setSplitIdx(0);
    setError(null);
  };

  // global set of chosen names (for disabling duplicates across all slots)
  const activeSlots = slots.slice(0, teamSize * 2);
  const chosenAll = new Set(activeSlots.filter((s) => s !== ""));

  const allChosen = activeSlots.every((s) => s !== "");

  // running totals while selecting
  const liveTotal = (team: number) => {
    let sum = 0;
    for (let i = 0; i < teamSize; i++) {
      const sc = scoreOf(activeSlots[team * teamSize + i]);
      if (sc !== null) sum += sc;
    }
    return round2(sum);
  };

  const handleBalance = () => {
    const selected: Selected[] = activeSlots.map((name) => ({
      name,
      score: scoreOf(name) ?? 0,
    }));
    setSplits(allBalancedSplits(selected));
    setSplitIdx(0);
  };

  const handleNextSplit = () => {
    setSplitIdx((i) => (i + 1) % splits.length);
  };

  const buildShareText = (r: BalanceResult) => {
    const lines: string[] = [];
    lines.push(`⚔️ KẾT QUẢ CHIA ĐỘI (${teamSize}v${teamSize})`);
    lines.push("");
    lines.push(`🔵 Đội 1 (tổng ${round2(r.scoreA)}):`);
    r.teamA.forEach((p) => lines.push(`  - ${p.name} (${p.score})`));
    lines.push("");
    lines.push(`🔴 Đội 2 (tổng ${round2(r.scoreB)}):`);
    r.teamB.forEach((p) => lines.push(`  - ${p.name} (${p.score})`));
    lines.push("");
    lines.push(`📊 Chênh lệch: ${r.diff}`);
    if (r.handicaps.length > 0) {
      lines.push("⚖️ Chấp quân:");
      r.handicaps.forEach((h) =>
        lines.push(
          `  - ${h.name} (${h.team === "A" ? "Đội 1" : "Đội 2"}) cầm ${h.civ}`
        )
      );
    } else {
      lines.push("✅ Hai đội cân bằng, không cần chấp quân.");
    }
    return lines.join("\n");
  };

  const handleShareZalo = async () => {
    if (!result) return;
    const text = buildShareText(result);

    // Trên di động, Web Share API cho phép chọn Zalo trực tiếp.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Kết quả chia đội", text });
        return;
      } catch {
        // người dùng hủy hoặc lỗi -> rơi xuống fallback
      }
    }

    // Fallback: copy nội dung rồi mở Zalo để dán.
    try {
      await navigator.clipboard.writeText(text);
      setShareMsg("Đã sao chép kết quả! Mở Zalo và dán vào khung chat.");
    } catch {
      setShareMsg("Không sao chép được. Hãy chọn và copy thủ công nội dung bên dưới.");
    }
    window.open("https://zalo.me/", "_blank");
    setTimeout(() => setShareMsg(null), 6000);
  };

  const handleAutoFill = () => {
    const need = teamSize * 2;
    const top = [...players].slice(0, need).map((p) => p.name);
    if (top.length < need) {
      setError(`Cần ít nhất ${need} game thủ trong sheet để tự động điền.`);
      return;
    }
    setSlots(top);
    setSplits([]);
    setSplitIdx(0);
  };

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => b.score - a.score),
    [players]
  );

  return (
    <main className="min-h-screen max-w-5xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-gray-900">
          ⚔️ Chia Team AOE Tnex
        </h1>
        <p className="text-gray-600 text-sm">
          Dữ liệu game thủ đọc trực tiếp từ <a className="text-blue" target="_blank" href="https://docs.google.com/spreadsheets/d/1dlmPB-2zp4Woe3hCLGVZY3d-A-R4NWGJ634tANUu700/edit?usp=sharing">Google Sheet</a>. Chọn thành viên mỗi đội, hệ thống gợi ý chia team cân bằng nhất.
        </p>
      </header>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <button
          onClick={fetchPlayers}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition"
        >
          🔄 Tải lại từ Sheet
        </button>
        <button
          onClick={handleAutoFill}
          className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition"
        >
          ⚡ Tự điền top {teamSize * 2}
        </button>

        <div className="flex items-center gap-2 ml-2">
          <span className="text-sm text-gray-600">Chế độ:</span>
          <select
            value={teamSize}
            onChange={(e) => changeTeamSize(Number(e.target.value))}
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 shadow-sm"
          >
            <option value={2}>2 vs 2</option>
            <option value={3}>3 vs 3</option>
            <option value={4}>4 vs 4</option>
          </select>
        </div>

        <span className="text-sm text-gray-600 self-center">
          {loading ? "Đang tải..." : `${players.length} game thủ`}
        </span>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-300 text-red-700 text-sm">
          ⚠️ {error}
          <div className="mt-2 text-xs text-red-600/80">
            Mẹo: Mở Google Sheet → Chia sẻ → đặt quyền &quot;Bất kỳ ai có đường
            liên kết&quot; (Người xem).
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {[0, 1].map((team) => {
          const total = liveTotal(team);
          return (
            <div
              key={team}
              className={`rounded-xl border p-5 ${
                team === 0
                  ? "border-blue-300 bg-blue-50"
                  : "border-red-300 bg-red-50"
              }`}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  {team === 0 ? "🔵 Đội 1" : "🔴 Đội 2"}
                </h2>
                <span className="text-sm font-mono px-3 py-1 rounded-full bg-white border border-gray-300 shadow-sm">
                  Tổng: {total}
                </span>
              </div>
              <div className="space-y-3">
                {Array.from({ length: teamSize }).map((_, i) => {
                  const idx = team * teamSize + i;
                  const sc = scoreOf(activeSlots[idx]);
                  const disabledNames = new Set(
                    Array.from(chosenAll).filter(
                      (nm) => nm !== activeSlots[idx]
                    )
                  );
                  return (
                    <div key={idx} className="flex items-center gap-3">
                      <PlayerSearchSelect
                        players={sortedPlayers}
                        value={activeSlots[idx]}
                        disabledNames={disabledNames}
                        onChange={(name) => setSlot(idx, name)}
                      />
                      <span className="w-12 text-right text-sm font-mono text-gray-700">
                        {sc !== null ? sc : "–"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center mb-8">
        <button
          onClick={handleBalance}
          disabled={!allChosen}
          className="px-8 py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold transition"
        >
          🎯 Chia TEAM
        </button>
      </div>

      {result && (
        <section className="rounded-xl border border-gray-300 bg-white shadow-sm p-6">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <h2 className="text-2xl font-bold text-gray-900">
              📊 Kết quả ghép đội
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                Cách {splitIdx + 1}/{splits.length}
                {splitIdx === 0 ? " (cân bằng nhất)" : ""}
              </span>
              <button
                onClick={handleNextSplit}
                disabled={splits.length <= 1}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium transition"
              >
                🔀 Chia cách khác
              </button>
              <button
                onClick={handleShareZalo}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition"
              >
                💬 Chia sẻ Zalo
              </button>
            </div>
          </div>

          {shareMsg && (
            <div className="mb-4 p-3 rounded-lg bg-sky-50 border border-sky-300 text-sky-800 text-sm">
              {shareMsg}
            </div>
          )}

          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            <span className="px-3 py-1 rounded-full bg-blue-100 border border-blue-300 text-blue-800">
              Tổng Đội 1: <strong>{round2(result.scoreA)}</strong>
            </span>
            <span className="px-3 py-1 rounded-full bg-red-100 border border-red-300 text-red-800">
              Tổng Đội 2: <strong>{round2(result.scoreB)}</strong>
            </span>
            <span className="px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-800">
              Chênh lệch: <strong>{result.diff}</strong>
            </span>
          </div>

          {result.handicaps.length > 0 ? (
            <div className="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-sm">
              <div className="font-semibold mb-2">⚖️ Chấp quân (đội yếu hơn):</div>
              <ul className="space-y-1">
                {result.handicaps.map((h, i) => (
                  <li key={i}>
                    • <strong>{h.name}</strong> (
                    {h.team === "A" ? "🔵 Đội 1" : "🔴 Đội 2"}) cầm{" "}
                    <strong>{h.civ}</strong>
                  </li>
                ))}
              </ul>
              <div className="text-amber-700/80 text-xs mt-2">
                Mỗi 1.0 điểm chênh lệch → 1 người yếu nhất cầm Shang; phần lẻ ≥
                0.5 → người tiếp theo cầm Assyrian.
              </div>
            </div>
          ) : (
            <div className="mb-4 p-4 rounded-lg bg-green-50 border border-green-300 text-green-800 text-sm">
              ✅ Hai đội cân bằng (chênh &lt; 0.5), không cần chấp quân.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-300 text-left">
                  <th className="py-2 px-3 text-blue-700">🔵 Đội 1</th>
                  <th className="py-2 px-3 text-blue-700 text-right">Điểm</th>
                  <th className="py-2 px-3 text-red-700">🔴 Đội 2</th>
                  <th className="py-2 px-3 text-red-700 text-right">Điểm</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: teamSize }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-200">
                    <td className="py-2 px-3">{result.teamA[i]?.name ?? ""}</td>
                    <td className="py-2 px-3 text-right font-mono">
                      {result.teamA[i]?.score ?? ""}
                    </td>
                    <td className="py-2 px-3">{result.teamB[i]?.name ?? ""}</td>
                    <td className="py-2 px-3 text-right font-mono">
                      {result.teamB[i]?.score ?? ""}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-100">
                  <td className="py-2 px-3">Tổng</td>
                  <td className="py-2 px-3 text-right font-mono">
                    {round2(result.scoreA)}
                  </td>
                  <td className="py-2 px-3">Tổng</td>
                  <td className="py-2 px-3 text-right font-mono">
                    {round2(result.scoreB)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
