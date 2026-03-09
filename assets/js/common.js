async function requireAuth() {
  const { data: { session } } = await window.supabase.auth.getSession();
  if (!session) {
    // send user back to login page (alias login.html redirects to index)
    window.location.href = "login.html";
    return null;
  }
  return session.user;
}

async function loadCurrentUserProfile(userId) {
  const { data, error } = await window.supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    // If no profile exists, create a minimal one so the app can proceed.
    if (error.code === "PGRST116") {
      const { data: authData } = await window.supabase.auth.getUser();
      const authUser = authData.user;
      const fallbackProfile = {
        id: userId,
        name: authUser?.user_metadata?.name || "Student",
        email: authUser?.email || "",
        role: "student",
        parent_id: null
      };

      const { error: insertError } = await window.supabase.from("profiles").insert(fallbackProfile);
      if (insertError) {
        throw insertError;
      }

      // also ensure wallet exists
      await window.supabase.from("wallets").insert({ user_id: userId, balance: 0 });

      return fallbackProfile;
    }
    throw error;
  }

  return data;
}

async function setupCommonLayout() {
  const user = await requireAuth();
  if (!user) return null;

  // load profile so other parts of app know the role, etc.
  const profile = await loadCurrentUserProfile(user.id);
  window.__currentUserProfile = profile;

  const userBadge = document.getElementById("userBadge");
  if (userBadge) {
    userBadge.textContent = user.email;
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await window.supabase.auth.signOut();
      window.location.href = "login.html";
    });
  }

  // global anchor delegation so <a> links behave consistently
  document.body.addEventListener('click', (e) => {
    const anchor = e.target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (href && !href.startsWith('#')) {
      e.preventDefault();
      window.location.href = href;
    }
  });

  setupKeyboardNavigation();

  return user;
}

function setupKeyboardNavigation() {
  if (window.__appShortcutsBound) return;
  window.__appShortcutsBound = true;

  const role = (window.__currentUserProfile?.role || "").toLowerCase();
  const shortcuts = {
    h: "student-dashboard.html",
    d: "student-dashboard.html",
    t: "student-dashboard.html",
    a: "analytics.html"
  };
  if (role === "parent") {
    shortcuts.r = "parent-dashboard.html";
  }

  document.addEventListener("keydown", (event) => {
    const tag = event.target?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || event.target?.isContentEditable) return;
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    const key = String(event.key || "").toLowerCase();
    const target = shortcuts[key];
    if (!target) return;

    event.preventDefault();
    const currentPath = window.location.pathname;
    if (!currentPath.endsWith(`/${target}`) && !currentPath.endsWith(target)) {
      window.location.href = target;
    }
  });
}

window.common = {
  requireAuth,
  loadCurrentUserProfile,
  setupCommonLayout
};
