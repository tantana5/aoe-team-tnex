"use client";

export type ChartDatum = {
  label: string;
  value: number; // giá trị thô để vẽ độ dài cột
  display: string; // nhãn hiển thị (vd "75%" hoặc "12")
};

/** Biểu đồ cột ngang đơn giản (không phụ thuộc thư viện ngoài). */
export default function StatBarChart({
  data,
  barClassName = "bg-emerald-500",
  emptyText = "Không có dữ liệu.",
}: {
  data: ChartDatum[];
  barClassName?: string;
  emptyText?: string;
}) {
  if (data.length === 0) {
    return (
      <div className="text-center text-gray-400 text-sm py-6">{emptyText}</div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={d.label} className="flex items-center gap-3">
          <div className="w-6 text-right text-xs text-gray-400 shrink-0">
            {i + 1}
          </div>
          <div className="w-28 sm:w-36 truncate text-sm text-gray-700 shrink-0">
            {d.label}
          </div>
          <div className="flex-1 h-6 rounded-md bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-md ${barClassName} transition-all`}
              style={{ width: `${(d.value / max) * 100}%`, minWidth: "2px" }}
            />
          </div>
          <div className="w-14 text-right font-mono text-sm text-gray-700 shrink-0">
            {d.display}
          </div>
        </div>
      ))}
    </div>
  );
}
