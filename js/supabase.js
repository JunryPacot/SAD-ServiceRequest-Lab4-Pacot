const SUPABASE_URL = "https://rulvmmpptslzfgkzskqa.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1bHZtbXBwdHNsemZna3pza3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MTM0MzUsImV4cCI6MjEwNDk4OTQzNX0.4Ozm8U0qka_TdV8zbkroQXhmFLbKEYQ3h9Cik9AjNhQ";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
