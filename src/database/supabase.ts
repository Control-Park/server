import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // using service role key to bypass row-level security

if (!supabaseUrl) {
  throw new Error("Missing Supabase URL in .env");
}

if (!supabaseServiceKey) {
  throw new Error("Missing Supabase Service key in .env");
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
