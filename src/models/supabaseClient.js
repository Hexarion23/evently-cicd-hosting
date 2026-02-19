import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || 'https://fyfyvadrabgptmbiuvcl.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5Znl2YWRyYWJncHRtYml1dmNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyMDE5OTYsImV4cCI6MjA3ODc3Nzk5Nn0.kcqDjL3ZaZVOlVU7sDlcl6x5MxrWPlZ_681hzYbbSbQ';

const supabase = createClient(supabaseUrl, supabaseKey);

export { supabase };
  