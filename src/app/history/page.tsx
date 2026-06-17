"use client";

import { useEffect, useMemo, useState } from "react";
import MatchScoreCard from "../components/MatchScoreCard";
import Pagination from "../components/Pagination";
import type { MatchStore, SavedMatch } from "@/lib/types";

const PAGE_SIZE = 10;

export default function HistoryPage() {
  const [matches, setMatches] = useState<SavedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/matches");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi tải dữ liệu");
      const store = (data.store ?? []) as MatchStore;
      // làm phẳng tất cả kèo, sắp xếp mới nhất trước
      const all = [...store].sort((a, b) =>
        a.matchDate < b.matchDate ? 1 : -1
      );
      setMatches(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // lọc theo khoảng ngày (dựa trên ngày createdAt, so sánh yyyy-mm-dd)
  const filtered = useMemo(() => {
    return matches.filter((m) => {
      const day = m.createdAt.slice(0, 10);
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      return true;
    });
  }, [matches, fromDate, toDate]);

  // reset về trang 1 khi đổi bộ lọc
  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const updateMatchInList = (updated: SavedMatch) => {
    setMatches((prev) =>
      prev.map((m) => (m.id === updated.id ? updated : m))
    );
  };

  const clearFilter = () => {
    setFromDate("");
    setToDate("");
  };

  const importFromExcel = async () => {
    const ok = window.confirm(
      "⚠️ CẢNH BÁO: Thao tác này sẽ TẢI TOÀN BỘ lịch sử từ file Excel và thêm vào dữ liệu. Những ngày đã có kèo sẽ được giữ nguyên (bỏ qua), không bị ghi đè.\n\nBạn có chắc chắn muốn tiếp tục?"
    );
    if (!ok) return;

    setImporting(true);
    setImportMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/matches/import", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import thất bại");
      setImportMsg(
        `Đã import ${data.imported} kèo mới, bỏ qua ${data.skipped} ngày đã có dữ liệu.`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import thất bại");
    } finally {
      setImporting(false);
    }
  };

  return (
    <main className="min-h-screen max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2 text-gray-900">📜 Lịch sử đấu</h1>
      <p className="text-gray-600 text-sm mb-6">
        Danh sách các kèo đã lưu. Lọc theo ngày và cập nhật tỷ số nếu cần.
      </p>

      <button
        onClick={importFromExcel}
        disabled={importing}
        className="mb-6 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition disabled:opacity-50"
      >
        {importing ? "Đang import..." : "📥 Tải toàn bộ lịch sử từ Excel"}
      </button>

      {importMsg && (
        <div className="mb-6 p-4 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-700 text-sm">
          ✅ {importMsg}
        </div>
      )}

      {/* bộ lọc */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Từ ngày</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Đến ngày</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
          />
        </div>
        {(fromDate || toDate) && (
          <button
            onClick={clearFilter}
            className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm transition"
          >
            Xóa lọc
          </button>
        )}
        <button
          onClick={load}
          className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm transition"
        >
          🔄 Tải lại
        </button>
        <span className="text-sm text-gray-500 self-center ml-auto">
          {filtered.length} kèo
        </span>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-300 text-red-700 text-sm">
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-10">Đang tải...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-300 bg-white shadow-sm p-8 text-center text-gray-500">
          Không có kèo đấu nào phù hợp.
        </div>
      ) : (
        <>
          {/* phân trang trên đầu danh sách */}
          {totalPages > 1 && (
            <div className="mb-5">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}

          <div className="space-y-5">
            {pageItems.map((m) => (
              <MatchScoreCard
                key={m.id}
                match={m}
                onUpdated={updateMatchInList}
              />
            ))}
          </div>

          {/* phân trang cuối danh sách */}
          {totalPages > 1 && (
            <div className="mt-8">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}
    </main>
  );
}
