"use client";

import { useEffect, useState } from "react";
import type { SavedMatch } from "@/lib/types";

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function MatchScoreCard({
  match,
  editable = true,
  onUpdated,
}: {
  match: SavedMatch;
  editable?: boolean;
  onUpdated?: (m: SavedMatch) => void;
}) {
  const [current, setCurrent] = useState<SavedMatch>(match);
  const [scoreInput, setScoreInput] = useState({ a: "", b: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setCurrent(match);
    setScoreInput({
      a: match.winsA === null || match.winsA === undefined ? "" : String(match.winsA),
      b: match.winsB === null || match.winsB === undefined ? "" : String(match.winsB),
    });
    setMsg(null);
  }, [match]);

  const noScore = current.winsA === null || current.winsA === undefined;

  const handleUpdate = async () => {
    const a = scoreInput.a.trim();
    const b = scoreInput.b.trim();
    if (a === "" || b === "" || isNaN(Number(a)) || isNaN(Number(b))) {
      setMsg({ ok: false, text: "Nhập tỷ số hợp lệ cho cả 2 đội." });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/matches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: current.id,
          winsA: Number(a),
          winsB: Number(b),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cập nhật thất bại");
      setCurrent(data.match as SavedMatch);
      setMsg({ ok: true, text: "Đã cập nhật tỷ số." });
      onUpdated?.(data.match as SavedMatch);
    } catch (e) {
      setMsg({
        ok: false,
        text: e instanceof Error ? e.message : "Cập nhật thất bại",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="rounded-xl border border-gray-300 bg-white shadow-sm p-3">
        <div className="text-left font-medium text-gray-500 mb-1">
          {current.matchDate} ·{" "}
          {current.teamSize}v{current.teamSize}
        </div>

        <div className="flex items-center justify-center gap-3 mb-3">
          <span
            className={`text-lg font-bold ${
              current.winner === "A" ? "text-blue-600 scale-110" : "text-gray-700"
            }`}
          >
            🔵 Đội 1
          </span>

          {editable ? (
            <input
              type="number"
              min={0}
              value={scoreInput.a}
              onChange={(e) => setScoreInput((s) => ({ ...s, a: e.target.value }))}
              placeholder="-"
              className="w-14 text-center text-xl font-mono font-bold border border-gray-300 rounded-lg py-1 focus:outline-none focus:border-blue-400"
            />
          ) : (
            <span className="w-14 text-center text-xl font-mono font-bold">
              {current.winsA ?? "-"}
            </span>
          )}

          <span className="text-xl font-bold text-gray-400">-</span>

          {editable ? (
            <input
              type="number"
              min={0}
              value={scoreInput.b}
              onChange={(e) => setScoreInput((s) => ({ ...s, b: e.target.value }))}
              placeholder="-"
              className="w-14 text-center text-xl font-mono font-bold border border-gray-300 rounded-lg py-1 focus:outline-none focus:border-red-400"
            />
          ) : (
            <span className="w-14 text-center text-xl font-mono font-bold">
              {current.winsB ?? "-"}
            </span>
          )}

          <span
            className={`text-lg font-bold ${
              current.winner === "B" ? "text-red-600 scale-110" : "text-gray-700"
            }`}
          >
            Đội 2 🔴
          </span>

          {editable && (
            <button
              onClick={handleUpdate}
              disabled={saving}
              title="Lưu tỷ số"
              className="ml-1 w-7 h-7 flex items-center justify-center rounded-md bg-white border border-emerald-500 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 text-sm transition"
            >
              {saving ? "…" : "✓"}
            </button>
          )}
        </div>

        {msg && (
          <div
            className={`text-center text-xs mb-3 ${
              msg.ok ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {msg.text}
          </div>
        )}

        {noScore && !msg ? (
          <div className="text-center text-xs text-amber-600 mb-3">
            Chưa cập nhật tỷ số
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div
            className={`rounded-lg p-3 transition ${
              current.winner === "A"
                ? "bg-blue-50 border-2 border-blue-400 shadow-sm"
                : "border-2 border-transparent"
            }`}
          >
            <div className="text-blue-700 font-medium mb-1 flex items-center gap-1">
              🔵 Đội 1 ({round2(current.scoreA)})
              {current.winner === "A" && <span title="Thắng">🏆</span>}
            </div>
            <ul className="text-gray-700 space-y-0.5">
              {current.teamA.map((p) => (
                <li key={p.name}>
                  {p.name} <span className="text-gray-400">({p.score})</span>
                </li>
              ))}
            </ul>
          </div>
          <div
            className={`rounded-lg p-3 transition ${
              current.winner === "B"
                ? "bg-red-50 border-2 border-red-400 shadow-sm"
                : "border-2 border-transparent"
            }`}
          >
            <div className="text-red-700 font-medium mb-1 flex items-center gap-1">
              🔴 Đội 2 ({round2(current.scoreB)})
              {current.winner === "B" && <span title="Thắng">🏆</span>}
            </div>
            <ul className="text-gray-700 space-y-0.5">
              {current.teamB.map((p) => (
                <li key={p.name}>
                  {p.name} <span className="text-gray-400">({p.score})</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
