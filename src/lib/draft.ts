/**
 * Kho JSON cho "kèo nháp" (vừa chia team, chưa có tỷ số). Kèo nháp KHÔNG ghi vào Supabase;
 * chỉ khi nhập tỷ số mới được ghi sang Supabase (xem saveDraftScore trong matches.ts).
 *
 * Chỉ giữ 1 kèo nháp mới nhất. Nơi lưu:
 * - Có BLOB_READ_WRITE_TOKEN (Vercel): file `match-draft.json` trên Vercel Blob.
 * - Local dev: `.data/match-draft.json`.
 * - Serverless chưa cấu hình Blob: thư mục tạm (/tmp) -> KHÔNG bền vững, có thể mất bất cứ lúc nào.
 */
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { Selected } from "./balance";

export type MatchDraft = {
  id: string; // "draft-<timestamp>"
  createdAt: string; // ISO, thời điểm chia team
  teamA: Selected[]; // điểm = điểm player lúc chia team
  teamB: Selected[];
  /** id kèo trong Supabase nếu lần lưu tỷ số trước bị lỗi giữa chừng (để lưu tiếp, không tạo trùng) */
  savedId?: number;
};

const BLOB_PATH = "match-draft.json";
const isServerless = !!process.env.VERCEL || !!process.env.AWS_REGION;
const LOCAL_PATH = isServerless
  ? path.join(os.tmpdir(), BLOB_PATH)
  : path.join(process.cwd(), ".data", BLOB_PATH);

const hasBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

function parseDraft(raw: unknown): MatchDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<MatchDraft>;
  if (typeof d.id !== "string" || !Array.isArray(d.teamA) || !Array.isArray(d.teamB)) return null;
  return d as MatchDraft;
}

export function newDraftId(): string {
  return `draft-${Date.now()}`;
}

export const isDraftId = (id: unknown): id is string =>
  typeof id === "string" && /^draft-\d+$/.test(id);

export async function readDraft(): Promise<MatchDraft | null> {
  if (hasBlob()) {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: BLOB_PATH });
    const found = blobs.find((b) => b.pathname === BLOB_PATH);
    if (!found) return null;
    // thêm tham số để không đọc phải bản cache cũ trên CDN
    const res = await fetch(`${found.url}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Không đọc được kèo nháp (HTTP ${res.status}).`);
    return parseDraft(await res.json());
  }

  try {
    return parseDraft(JSON.parse(await fs.readFile(LOCAL_PATH, "utf-8")));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** Ghi kèo nháp (null = xóa kèo nháp). */
export async function writeDraft(draft: MatchDraft | null): Promise<void> {
  const json = JSON.stringify(draft);

  if (hasBlob()) {
    const { put } = await import("@vercel/blob");
    await put(BLOB_PATH, json, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      cacheControlMaxAge: 0,
    });
    return;
  }

  await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  await fs.writeFile(LOCAL_PATH, json, "utf-8");
}
