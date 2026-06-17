import { parseCsv } from "./csv";

/** ID Google Sheet nguồn dữ liệu (chia sẻ "Bất kỳ ai có đường liên kết"). */
export const SHEET_ID = "1dlmPB-2zp4Woe3hCLGVZY3d-A-R4NWGJ634tANUu700";

/** Lỗi khi đọc Google Sheet, kèm mã HTTP để caller xử lý status phù hợp. */
export class SheetFetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SheetFetchError";
    this.status = status;
  }
}

/**
 * Tải Google Sheet dưới dạng CSV và trả về mảng 2 chiều (dòng -> các ô).
 * Export CSV giữ nguyên vị trí cột (A, B, C, D, E...) nên index cột luôn ổn định.
 */
export async function fetchSheetRows(gid = 0): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; TeamBalancer/1.0)",
    },
  });

  if (!res.ok) {
    throw new SheetFetchError(
      `Không đọc được Google Sheet (HTTP ${res.status}). Hãy đảm bảo sheet được chia sẻ ở chế độ "Bất kỳ ai có đường liên kết".`,
      502
    );
  }

  const csv = await res.text();
  return parseCsv(csv);
}
