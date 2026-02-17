async function requireAuth() {
  const { data: { session } } = await window.supabase.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
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

  const userBadge = document.getElementById("userBadge");
  if (userBadge) {
    userBadge.textContent = user.email;
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await window.supabase.auth.signOut();
      window.location.href = "index.html";
    });
  }

  return user;
}

window.common = {
  requireAuth,
  loadCurrentUserProfile,
  setupCommonLayout
};
