/**
 * Cấu hình dùng chung cho Chọn áo cho anh em Panda.
 * Dán URL và anon key của Supabase vào giữa hai dấu nháy.
 * Đây là anon key công khai; quyền truy cập được giới hạn bằng RLS trong schema.sql.
 */
window.APP_CONFIG = {
  SUPABASE_URL: "https://tdwiwfyqqrsexkwzmgso.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_D5QhvSdwBuis8ewir3SO4A_Wn9qA0S-",
  // Có thể dùng anon key cũ nếu dự án chưa có publishable key.
  SUPABASE_ANON_KEY: "",
  REFRESH_INTERVAL_MS: 15000,
};
