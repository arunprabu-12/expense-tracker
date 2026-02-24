// supabaseClient.js is responsible for instantiating the real client
// using the configuration values defined in config.js.  We also expose
// the client under two names for backwards compatibility: `supabase` and
// `supabaseClient`.

const supabaseUrl = window.SUPABASE_URL;
const supabaseAnonKey = window.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("YOUR_PROJECT_ID")) {
  // eslint-disable-next-line no-alert
  alert("Please configure SUPABASE_URL and SUPABASE_ANON_KEY in assets/js/config.js");
}

// create the client once if not already created
if (!window.supabaseClient) {
  window.supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
}

// make sure both globals point to the same instance
window.supabase = window.supabaseClient;

window.appUtils = {
  formatCurrency(value) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value) || 0);
  },
  startOfMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  },
  daysLeftInMonth() {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return Math.max(1, end.getDate() - now.getDate() + 1);
  }
};
