import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://tkjfbbtvuuoaprljftik.supabase.co";
const supabaseAnonKey = "sb_publishable_GhyPvP7XYSbPjJMAOIghEg_dQwQaFlv";

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);