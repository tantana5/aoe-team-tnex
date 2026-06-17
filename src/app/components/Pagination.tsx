"use client";

import { useEffect, useState } from "react";

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const [input, setInput] = useState(String(currentPage));

  // đồng bộ ô nhập khi trang hiện tại đổi từ bên ngoài
  useEffect(() => {
    setInput(String(currentPage));
  }, [currentPage]);

  if (totalPages <= 1) return null;

  const go = (p: number) => {
    const next = Math.min(totalPages, Math.max(1, p));
    onPageChange(next);
  };

  const commitInput = () => {
    const n = Number(input);
    if (!Number.isNaN(n)) {
      go(Math.trunc(n));
    } else {
      setInput(String(currentPage));
    }
  };

  const btn =
    "px-3 py-2 rounded-lg bg-white border border-gray-300 text-sm disabled:opacity-40 hover:bg-gray-50 transition";

  return (
    <div className="flex items-center justify-center flex-wrap gap-2">
      <button
        onClick={() => go(1)}
        disabled={currentPage === 1}
        className={btn}
        title="Trang đầu"
      >
        « Đầu
      </button>
      <button
        onClick={() => go(currentPage - 1)}
        disabled={currentPage === 1}
        className={btn}
      >
        ← Trước
      </button>

      <div className="flex items-center gap-1 text-sm text-gray-600">
        <span>Trang</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={commitInput}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          className="w-16 text-center border border-gray-300 rounded-lg py-1 focus:outline-none focus:border-blue-400"
        />
        <span>/ {totalPages}</span>
      </div>

      <button
        onClick={() => go(currentPage + 1)}
        disabled={currentPage === totalPages}
        className={btn}
      >
        Sau →
      </button>
      <button
        onClick={() => go(totalPages)}
        disabled={currentPage === totalPages}
        className={btn}
        title="Trang cuối"
      >
        Cuối »
      </button>
    </div>
  );
}
