"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { allBalancedSplits, type BalanceResult, type Selected } from "@/lib/balance";
import type { SavedMatch } from "@/lib/types";
import MatchScoreCard from "./components/MatchScoreCard";

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

  // tên đã được chọn ở ô khác -> hiển thị nhưng không cho chọn
  const isDisabled = (name: string) =>
    disabledNames.has(name) && name !== value;

  // chỉ số các option có thể chọn (dùng cho điều hướng bàn phím)
  const selectableIdx = useMemo(
    () => filtered.map((p, i) => (isDisabled(p.name) ? -1 : i)).filter((i) => i >= 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, disabledNames, value]
  );

  // reset highlight khi mở hoặc khi từ khóa thay đổi (về option chọn được đầu tiên)
  useEffect(() => {
    setHighlight(selectableIdx[0] ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // tìm option chọn được kế tiếp theo hướng (1 hoặc -1)
  const moveHighlight = (dir: 1 | -1) => {
    if (selectableIdx.length === 0) return;
    const pos = selectableIdx.indexOf(highlight);
    if (pos === -1) {
      setHighlight(dir === 1 ? selectableIdx[0] : selectableIdx[selectableIdx.length - 1]);
      return;
    }
    const nextPos = Math.min(
      selectableIdx.length - 1,
      Math.max(0, pos + dir)
    );
    setHighlight(selectableIdx[nextPos]);
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
      moveHighlight(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveHighlight(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[highlight];
      if (pick && !isDisabled(pick.name)) commit(pick.name);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  };

  const selectedScore = players.find((p) => p.name === value)?.score;

  return (
    <div className="relative flex-1" ref={ref}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          onKeyDown={handleKeyDown}
          className="flex-1 text-left bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 flex justify-between items-center shadow-sm"
        >
          <span className={value ? "" : "text-gray-400"}>
            {value ? `${value} (${selectedScore})` : "— Chọn game thủ —"}
          </span>
          <span className="text-gray-400 text-xs">▼</span>
        </button>
        <button
          type="button"
          onClick={() => onChange("")}
          disabled={!value}
          title="Bỏ chọn"
          className="w-5 h-5 text-xs flex items-center justify-center text-gray-100 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition shrink-0"
        >
          ✖
        </button>
      </div>

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
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-400">
                Không tìm thấy
              </div>
            )}
            {filtered.map((p, i) => {
              const disabled = isDisabled(p.name);
              return (
                <div
                  key={p.name}
                  ref={(el) => {
                    optionRefs.current[i] = el;
                  }}
                  onClick={() => !disabled && commit(p.name)}
                  onMouseEnter={() => !disabled && setHighlight(i)}
                  className={`px-3 py-2 text-sm flex justify-between ${
                    disabled
                      ? "text-gray-300 cursor-not-allowed"
                      : `cursor-pointer ${
                          i === highlight ? "bg-blue-100" : "hover:bg-blue-50"
                        }`
                  } ${p.name === value ? "font-semibold" : ""}`}
                >
                  <span>
                    {p.name}
                    {disabled && (
                      <span className="ml-1 text-xs text-gray-300">(đã chọn)</span>
                    )}
                  </span>
                  <span className="font-mono text-gray-400">{p.score}</span>
                </div>
              );
            })}
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
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [latestMatch, setLatestMatch] = useState<SavedMatch | null>(null);
  const [showDateModal, setShowDateModal] = useState(false);
  const [matchDate, setMatchDate] = useState("");
  const [winsInput, setWinsInput] = useState({ a: "", b: "" });

  const result = splits[splitIdx] ?? null;

  const fetchPlayers = async () => {
    setLoading(true);
    setError(null);
    // reset các ô select mỗi lần tải lại từ sheet
    setSlots(Array(teamSize * 2).fill(""));
    setSplits([]);
    setSplitIdx(0);
    try {
      const res = await fetch("/api/players");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi tải dữ liệu");
      setPlayers(data.players || []);
      // sau khi load sheet thành công, nạp lại kèo đã lưu gần nhất
      loadLatestMatch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally {
      setLoading(false);
    }
  };

  const loadLatestMatch = async () => {
    try {
      const res = await fetch("/api/matches/latest");
      const data = await res.json();
      if (res.ok && data.match) {
        const m = data.match as SavedMatch;
        setLatestMatch(m);
      } else {
        setLatestMatch(null);
      }
    } catch {
      setLatestMatch(null);
    }
  };

  // Nạp lại các ô chọn game thủ từ một kèo đã lưu (không hiển thị kết quả ghép đội).
  const restoreFromMatch = (m: SavedMatch) => {
    const size = m.teamSize || m.teamA.length;
    setTeamSize(size);
    setSlots([
      ...m.teamA.map((p) => p.name),
      ...m.teamB.map((p) => p.name),
    ]);
    setSplits([]);
    setSplitIdx(0);
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

  const handleReset = () => {
    setSlots(Array(teamSize * 2).fill(""));
    setSplits([]);
    setSplitIdx(0);
    setShareMsg(null);
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

  const handleSaveMatch = async () => {
    if (!result) return;
    setSaveMsg(null);
    // mở popup nhập ngày, mặc định hôm nay (local yyyy-mm-dd)
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    const localDate = new Date(today.getTime() - tzOffset)
      .toISOString()
      .slice(0, 10);
    setMatchDate(localDate);
    setWinsInput({ a: "", b: "" });
    setShowDateModal(true);
  };

  const confirmSaveMatch = async () => {
    if (!result) return;

    // tỷ số: bỏ trống cả 2 => null (bỏ qua); nếu nhập thì phải nhập cả 2
    const a = winsInput.a.trim();
    const b = winsInput.b.trim();
    let winsA: number | null = null;
    let winsB: number | null = null;
    if (a !== "" || b !== "") {
      if (a === "" || b === "") {
        setSaveMsg({
          ok: false,
          text: "Vui lòng nhập tỷ số cho cả 2 đội hoặc để trống cả hai.",
        });
        return;
      }
      if (isNaN(Number(a)) || isNaN(Number(b))) {
        setSaveMsg({ ok: false, text: "Tỷ số không hợp lệ." });
        return;
      }
      winsA = Number(a);
      winsB = Number(b);
    }

    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamSize,
          matchDate,
          teamA: result.teamA,
          teamB: result.teamB,
          scoreA: result.scoreA,
          scoreB: result.scoreB,
          diff: result.diff,
          handicaps: result.handicaps,
          winsA,
          winsB,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lưu thất bại");
      setSaveMsg({
        ok: true,
        text: `Đã lưu kèo đấu ngày ${matchDate}.`,
      });
      setShowDateModal(false);
      // cập nhật lại kèo gần nhất hiển thị trên đầu trang
      loadLatestMatch();
    } catch (e) {
      setSaveMsg({
        ok: false,
        text: e instanceof Error ? e.message : "Lưu thất bại",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAutoFill = () => {
    const need = teamSize * 2;
    if (players.length < need) {
      setError(`Cần ít nhất ${need} game thủ trong sheet để tự động điền.`);
      return;
    }
    // chọn ngẫu nhiên `need` game thủ (xáo trộn Fisher-Yates)
    const pool = [...players];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picked = pool.slice(0, need).map((p) => p.name);
    setSlots(picked);
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
          Dữ liệu game thủ đọc trực tiếp từ <a className="text-blue-600 hover:underline" target="_blank" href="https://docs.google.com/spreadsheets/d/1dlmPB-2zp4Woe3hCLGVZY3d-A-R4NWGJ634tANUu700/edit?usp=sharing">Google Sheet</a>. Chọn thành viên mỗi đội, hệ thống gợi ý chia team cân bằng nhất.
        </p>
      </header>

      {latestMatch && (
        <div className="mb-6">
          <h2 className="font-semibold text-gray-800 mb-2">
            🕑 Kèo gần nhất đã lưu
          </h2>
          <MatchScoreCard
            match={latestMatch}
            onUpdated={(m) => setLatestMatch(m)}
          />
        </div>
      )}

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
          ⚡ Random {teamSize * 2} game thủ
        </button>
        <button
          onClick={() => latestMatch && restoreFromMatch(latestMatch)}
          disabled={!latestMatch}
          className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium transition"
        >
          🔁 Chơi lại kèo cũ
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

      <div className="flex justify-center gap-3 mb-8">
        <button
          onClick={handleReset}
          className="px-6 py-3 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold transition"
        >
          ↩️ Chọn lại
        </button>
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
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-between sm:items-center gap-3 mb-4">
            <h2 className="text-2xl font-bold text-gray-900">
              📊 Kết quả ghép đội
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-gray-500">
                Cách {splitIdx + 1}/{splits.length}
                {splitIdx === 0 ? " (cân bằng nhất)" : ""}
              </span>
              <button
                onClick={handleNextSplit}
                disabled={splits.length <= 1}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium transition whitespace-nowrap"
              >
                🔀 Chia cách khác
              </button>
              <button
                onClick={handleShareZalo}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition whitespace-nowrap"
              >
                💬 Chia sẻ Zalo
              </button>
              <button
                onClick={handleSaveMatch}
                disabled={saving}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium transition whitespace-nowrap"
              >
                {saving ? "Đang lưu..." : "💾 Lưu lại kèo đấu"}
              </button>
            </div>
          </div>

          {saveMsg && (
            <div
              className={`mb-4 p-3 rounded-lg border text-sm ${
                saveMsg.ok
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                  : "bg-red-50 border-red-300 text-red-700"
              }`}
            >
              {saveMsg.text}
            </div>
          )}

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

      {showDateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              💾 Lưu kèo đấu
            </h3>
            <label className="block text-sm text-gray-600 mb-1">
              Ngày diễn ra kèo
            </label>
            <input
              type="date"
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 mb-4"
            />

            <label className="block text-sm text-gray-600 mb-1">
              Tỷ số (tùy chọn)
            </label>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-blue-600">🔵 Đội 1</span>
              <input
                type="number"
                min={0}
                value={winsInput.a}
                onChange={(e) =>
                  setWinsInput((s) => ({ ...s, a: e.target.value }))
                }
                placeholder="-"
                className="w-16 text-center text-base font-mono font-bold border border-gray-300 rounded-lg py-1 focus:outline-none focus:border-blue-400"
              />
              <span className="text-gray-400 font-bold">-</span>
              <input
                type="number"
                min={0}
                value={winsInput.b}
                onChange={(e) =>
                  setWinsInput((s) => ({ ...s, b: e.target.value }))
                }
                placeholder="-"
                className="w-16 text-center text-base font-mono font-bold border border-gray-300 rounded-lg py-1 focus:outline-none focus:border-red-400"
              />
              <span className="text-sm font-medium text-red-600">Đội 2 🔴</span>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Để trống cả hai nếu chưa có kết quả.
            </p>

            {saveMsg && !saveMsg.ok && (
              <div className="mb-3 text-sm text-red-600">{saveMsg.text}</div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDateModal(false)}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm transition"
              >
                Hủy
              </button>
              <button
                onClick={confirmSaveMatch}
                disabled={saving || !matchDate}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-300 text-white text-sm font-medium transition"
              >
                {saving ? "Đang lưu..." : "Lưu lại"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
