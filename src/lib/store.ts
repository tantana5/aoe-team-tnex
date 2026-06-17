import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { MatchStore, SavedMatch } from "./types";

const BLOB_PATH = "matches.json";

// Khi chạy serverless (vd Vercel) filesystem chỉ đọc, chỉ có /tmp ghi được.
// Ưu tiên file dự án ở local dev; nếu môi trường không ghi được thì dùng thư mục tạm.
const PROJECT_PATH = path.join(process.cwd(), ".data", "matches.json");
const TMP_PATH = path.join(os.tmpdir(), "matches.json");
const isServerless = !!process.env.VERCEL || !!process.env.AWS_REGION;
const LOCAL_PATH = isServerless ? TMP_PATH : PROJECT_PATH;

const hasBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

/** Chuẩn hóa dữ liệu đọc lên thành mảng phẳng.
 * Hỗ trợ cả định dạng cũ (object gom theo ngày) lẫn định dạng mới (mảng). */
function normalize(data: unknown): MatchStore {
  if (Array.isArray(data)) return data as MatchStore;
  if (data && typeof data === "object") {
    return Object.values(data as Record<string, SavedMatch[]>).flat();
  }
  return [];
}

/** Đọc toàn bộ store (1 file JSON duy nhất). */
export async function readStore(): Promise<MatchStore> {
  if (hasBlob()) {
    try {
      const { list } = await import("@vercel/blob");
      const { blobs } = await list({ prefix: BLOB_PATH });
      const found = blobs.find((b) => b.pathname === BLOB_PATH);
      if (!found) return [];
      const res = await fetch(found.url, { cache: "no-store" });
      if (!res.ok) return [];
      return normalize(await res.json());
    } catch {
      return [];
    }
  }

  // dev fallback: file local
  try {
    const raw = await fs.readFile(LOCAL_PATH, "utf-8");
    return normalize(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Ghi đè toàn bộ store. */
export async function writeStore(store: MatchStore): Promise<void> {
  // minify để tiết kiệm dung lượng
  const json = JSON.stringify(store);

  if (hasBlob()) {
    const { put } = await import("@vercel/blob");
    await put(BLOB_PATH, json, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
    });
    return;
  }

  // dev fallback: ghi file (local dev dùng .data, serverless dùng /tmp)
  try {
    await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
    await fs.writeFile(LOCAL_PATH, json, "utf-8");
  } catch (e) {
    // Trên môi trường read-only mà chưa cấu hình Blob -> không thể lưu bền vững.
    throw new Error(
      "Không lưu được dữ liệu: môi trường chỉ đọc và chưa cấu hình Vercel Blob (BLOB_READ_WRITE_TOKEN). " +
        (e instanceof Error ? e.message : "")
    );
  }
}
