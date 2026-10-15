"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseCsv } from "@/lib/csv";
import {
  extractPlayers,
  IMPORT_MAX_ROWS,
  normalizeName,
  PLAYER_NAME_MAX,
  type PlayerInput,
  type PlayerRecord,
} from "@/lib/players";

type Filter = "all" | "active" | "inactive";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const inputClass =
  "bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi HTTP ${res.status}`);
  return data as T;
}

/** Công tắc bật/tắt player (role="switch" cho trình đọc màn hình). */
function ActiveSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:opacity-50 ${
        checked ? "bg-emerald-500" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  // form thêm mới
  const [newName, setNewName] = useState("");
  const [newScore, setNewScore] = useState("");
  const [adding, setAdding] = useState(false);

  // sửa inline
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editScore, setEditScore] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  // import
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{
    fileName: string;
    players: PlayerInput[];
    skipped: number;
  } | null>(null);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ players: PlayerRecord[] }>("/api/players?all=1");
      setPlayers(data.players);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải danh sách player");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((cur) => (cur === msg ? null : cur)), 5000);
  };

  const replacePlayer = (p: PlayerRecord) =>
    setPlayers((prev) => prev.map((x) => (x.id === p.id ? p : x)));

  const activeCount = players.filter((p) => p.active).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players
      .filter((p) => (filter === "all" ? true : filter === "active" ? p.active : !p.active))
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [players, query, filter]);

  // ---------- thêm mới ----------
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAdding(true);
    try {
      const { player, updated } = await api<{
        player: PlayerRecord;
        updated: boolean;
      }>("/api/players", {
        method: "POST",
        body: JSON.stringify({ name: newName, score: newScore }),
      });
      // trùng tên -> server cập nhật player cũ, thay thế trong danh sách thay vì thêm dòng mới
      setPlayers((prev) =>
        prev.some((p) => p.id === player.id)
          ? prev.map((p) => (p.id === player.id ? player : p))
          : [...prev, player]
      );
      setNewName("");
      setNewScore("");
      showNotice(
        updated
          ? `Player "${player.name}" đã tồn tại, đã cập nhật điểm thành ${player.score}.`
          : `Đã thêm player "${player.name}".`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi thêm player");
    } finally {
      setAdding(false);
    }
  };

  // ---------- sửa / bật tắt ----------
  const startEdit = (p: PlayerRecord) => {
    setEditId(p.id);
    setEditName(p.name);
    setEditScore(String(p.score));
    setError(null);
  };

  const cancelEdit = () => setEditId(null);

  const patchPlayer = async (id: number, body: Record<string, unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      const { player } = await api<{ player: PlayerRecord }>(`/api/players/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      replacePlayer(player);
      return player;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi cập nhật player");
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async () => {
    if (editId === null) return;
    const updated = await patchPlayer(editId, { name: editName, score: editScore });
    if (updated) {
      setEditId(null);
      showNotice(`Đã cập nhật "${updated.name}".`);
    }
  };

  const toggleActive = (p: PlayerRecord) => patchPlayer(p.id, { active: !p.active });

  // ---------- import ----------
  const handleFile = async (file: File) => {
    setError(null);
    setPreview(null);
    try {
      if (file.size > MAX_FILE_SIZE) throw new Error("File quá lớn (tối đa 5MB).");
      const lower = file.name.toLowerCase();
      let rows: unknown[][];
      if (lower.endsWith(".csv")) {
        rows = parseCsv(await file.text());
      } else if (lower.endsWith(".xlsx")) {
        const { readSheet } = await import("read-excel-file/universal");
        rows = await readSheet(await file.arrayBuffer());
      } else {
        throw new Error("Chỉ hỗ trợ file .xlsx hoặc .csv.");
      }

      const { players: parsed, skipped } = extractPlayers(rows);
      if (parsed.length === 0) {
        throw new Error(
          'Không tìm thấy player nào. File cần có cột tiêu đề "Tên" và "Điểm".'
        );
      }
      if (parsed.length > IMPORT_MAX_ROWS) {
        throw new Error(`File có quá nhiều dòng (tối đa ${IMPORT_MAX_ROWS} player).`);
      }
      setPreview({ fileName: file.name, players: parsed, skipped });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đọc được file");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const existingByName = useMemo(
    () => new Map(players.map((p) => [normalizeName(p.name), p])),
    [players]
  );

  const runImport = async (body: object) => {
    setImporting(true);
    setError(null);
    try {
      const r = await api<{
        inserted: number;
        updated: number;
        unchanged: number;
        invalid: number;
      }>("/api/players/import", { method: "POST", body: JSON.stringify(body) });
      setPreview(null);
      showNotice(
        `Import xong: ${r.inserted} player mới, ${r.updated} cập nhật điểm, ${r.unchanged} không đổi` +
          (r.invalid > 0 ? `, bỏ qua ${r.invalid} dòng không hợp lệ.` : ".")
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import thất bại");
    } finally {
      setImporting(false);
    }
  };

  const previewStats = useMemo(() => {
    if (!preview) return { added: 0, changed: 0 };
    let added = 0;
    let changed = 0;
    for (const p of preview.players) {
      const old = existingByName.get(p.name);
      if (!old) added++;
      else if (Number(old.score) !== p.score) changed++;
    }
    return { added, changed };
  }, [preview, existingByName]);

  return (
    <main className="min-h-screen max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2 text-gray-900">👥 Quản lý Player</h1>
      <p className="text-gray-600 text-sm mb-6">
        Thêm, sửa điểm và bật/tắt player. Chỉ player đang bật mới xuất hiện ở trang
        chia team.
      </p>

      {error && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-lg bg-red-50 border border-red-300 text-red-700 text-sm"
        >
          ⚠️ {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mb-6 p-4 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-700 text-sm"
        >
          ✅ {notice}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2 mb-6">
        {/* thêm mới */}
        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-gray-300 bg-white shadow-sm p-5"
        >
          <h2 className="font-semibold text-gray-800 mb-4">➕ Thêm player</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[160px]">
              <label htmlFor="new-name" className="block text-xs text-gray-500 mb-1">
                Tên
              </label>
              <input
                id="new-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={PLAYER_NAME_MAX}
                required
                className={`${inputClass} w-full`}
              />
            </div>
            <div className="w-28">
              <label htmlFor="new-score" className="block text-xs text-gray-500 mb-1">
                Điểm
              </label>
              <input
                id="new-score"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={newScore}
                onChange={(e) => setNewScore(e.target.value)}
                required
                className={`${inputClass} w-full`}
              />
            </div>
            <button
              type="submit"
              disabled={adding}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition disabled:opacity-50"
            >
              {adding ? "Đang thêm..." : "Thêm"}
            </button>
          </div>
        </form>

        {/* import */}
        <div className="rounded-xl border border-gray-300 bg-white shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-1">📥 Import player</h2>
          <p className="text-xs text-gray-500 mb-4">
            File .xlsx hoặc .csv có cột tiêu đề &quot;Tên&quot; và &quot;Điểm&quot;. Trùng
            tên sẽ cập nhật điểm.
          </p>
          <div className="flex flex-wrap gap-3">
            <label
              className={`px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition cursor-pointer focus-within:ring-2 focus-within:ring-emerald-400 ${
                importing ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              📄 Chọn file Excel
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="sr-only"
                disabled={importing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* xem trước file import */}
      {preview && (
        <div className="mb-6 rounded-xl border border-emerald-300 bg-white shadow-sm p-5">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="font-semibold text-gray-800">
              Xem trước: <span className="font-mono">{preview.fileName}</span>
            </h2>
            <span className="text-sm text-gray-600">
              {preview.players.length} player · {previewStats.added} mới ·{" "}
              {previewStats.changed} đổi điểm
              {preview.skipped > 0 && ` · bỏ qua ${preview.skipped} dòng`}
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg mb-4">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-left text-gray-600">
                  <th className="py-2 px-3">Tên</th>
                  <th className="py-2 px-3 text-right">Điểm</th>
                  <th className="py-2 px-3">Thay đổi</th>
                </tr>
              </thead>
              <tbody>
                {preview.players.map((p) => {
                  const old = existingByName.get(p.name);
                  return (
                    <tr key={p.name} className="border-t border-gray-100">
                      <td className="py-1.5 px-3 text-gray-800">{p.name}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{p.score}</td>
                      <td className="py-1.5 px-3 text-xs">
                        {!old ? (
                          <span className="text-emerald-600">Mới</span>
                        ) : Number(old.score) !== p.score ? (
                          <span className="text-amber-600">
                            {old.score} → {p.score}
                          </span>
                        ) : (
                          <span className="text-gray-400">Không đổi</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => runImport({ players: preview.players })}
              disabled={importing}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition disabled:opacity-50"
            >
              {importing ? "Đang import..." : "Xác nhận import"}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              disabled={importing}
              className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm transition disabled:opacity-50"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* bộ lọc */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label htmlFor="search" className="block text-xs text-gray-500 mb-1">
            Tìm kiếm
          </label>
          <input
            id="search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tên player..."
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="filter" className="block text-xs text-gray-500 mb-1">
            Trạng thái
          </label>
          <select
            id="filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className={inputClass}
          >
            <option value="all">Tất cả</option>
            <option value="active">Đang bật</option>
            <option value="inactive">Đã tắt</option>
          </select>
        </div>
        <button
          type="button"
          onClick={load}
          className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm transition"
        >
          🔄 Tải lại
        </button>
        <span className="text-sm text-gray-500 self-center ml-auto">
          {activeCount}/{players.length} đang bật
        </span>
      </div>

      {/* danh sách */}
      {loading ? (
        <div className="text-center text-gray-500 py-10">Đang tải...</div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-gray-300 bg-white shadow-sm p-8 text-center text-gray-500">
          {players.length === 0
            ? "Chưa có player nào. Hãy thêm mới hoặc import từ file Excel."
            : "Không có player nào phù hợp."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-300 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="py-3 px-4 w-12">#</th>
                <th className="py-3 px-4">Tên</th>
                <th className="py-3 px-4 w-32 text-right">Điểm</th>
                <th className="py-3 px-4 w-28 text-center">Bật</th>
                <th className="py-3 px-4 w-40 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p, i) => {
                const editing = editId === p.id;
                const busy = busyId === p.id;
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 ${
                      p.active ? "" : "text-gray-400"
                    }`}
                  >
                    <td className="py-3 px-4 text-gray-400">{i + 1}</td>
                    <td className="py-3 px-4">
                      {editing ? (
                        <input
                          aria-label="Tên player"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") cancelEdit();
                          }}
                          maxLength={PLAYER_NAME_MAX}
                          autoFocus
                          className={`${inputClass} w-full py-1`}
                        />
                      ) : (
                        <span className={`font-medium ${p.active ? "text-gray-800" : ""}`}>
                          {p.name}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {editing ? (
                        <input
                          aria-label="Điểm"
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          value={editScore}
                          onChange={(e) => setEditScore(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") cancelEdit();
                          }}
                          className={`${inputClass} w-24 py-1 text-right`}
                        />
                      ) : (
                        p.score
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <ActiveSwitch
                        checked={p.active}
                        disabled={busy}
                        label={`${p.active ? "Tắt" : "Bật"} player ${p.name}`}
                        onChange={() => toggleActive(p)}
                      />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {editing ? (
                        <>
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={busy}
                            className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition disabled:opacity-50"
                          >
                            {busy ? "Đang lưu..." : "Lưu"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={busy}
                            className="ml-2 px-3 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs transition disabled:opacity-50"
                          >
                            Hủy
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          disabled={busy}
                          aria-label={`Sửa player ${p.name}`}
                          className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs transition disabled:opacity-50"
                        >
                          ✏️ Sửa
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
