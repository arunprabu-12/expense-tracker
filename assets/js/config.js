// Updated Supabase project URL (project id provided by user)
window.SUPABASE_URL = "https://hcsmvwvjvkpqvyrtxfgd.supabase.co";

window.SUPABASE_ANON_KEY = "sb_publishable_2LWt5M0i9CL8ScsRdbS-cQ_6zPjwrhC";

window.supabaseClient = supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);
