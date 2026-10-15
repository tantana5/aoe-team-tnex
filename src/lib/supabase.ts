import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Chỉ dùng phía server (API route). Ưu tiên secret key nếu có, mặc định dùng publishable key. */
const getConfig = () => ({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key:
    process.env.SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

export const isSupabaseConfigured = () => {
  const { url, key } = getConfig();
  return !!url && !!key;
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  const { url, key } = getConfig();
  if (!url || !key) {
    throw new Error(
      "Chưa cấu hình Supabase (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)."
    );
  }
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      // tránh Next.js cache kết quả fetch của Supabase
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    });
  }
  return client;
}

export const PLAYERS_TABLE = "players";

/**
 * Schema bảng players: id, name, point (float4), is_enable (bool), created_at, updated_at.
 * Alias `point` -> `score`, `is_enable` -> `active` cho thống nhất với code app.
 */
export const PLAYER_COLUMNS =
  "id, name, score:point, active:is_enable, created_at, updated_at";

/** Đổi lỗi Supabase sang thông báo dễ hiểu. */
export function supabaseErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === "42501") {
    return "Supabase từ chối quyền ghi (RLS). Hãy chạy file supabase/migrations/20261015000000_players_policies.sql trong Supabase SQL Editor.";
  }
  if (error.code === "23503") {
    return "Dữ liệu tham chiếu không hợp lệ (foreign key): " + error.message;
  }
  return error.message;
}
