// =========================================================
// data.js — SUPABASE CLIENT (no auth session)
// =========================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(
  "https://fyfyvadrabgptmbiuvcl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5Znl2YWRyYWJncHRtYml1dmNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyMDE5OTYsImV4cCI6MjA3ODc3Nzk5Nn0.kcqDjL3ZaZVOlVU7sDlcl6x5MxrWPlZ_681hzYbbSbQ"
);

// ========== HELPERS ==========

// Backend-auth user fetch
export async function getBackendUser() {
  const res = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "include"
  });

  if (!res.ok) return null;

  const json = await res.json();
  return json.user || null;
}
