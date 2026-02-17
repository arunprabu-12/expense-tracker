const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const authMessage = document.getElementById("authMessage");

function showMessage(text, isError = false) {
  authMessage.textContent = text;
  authMessage.style.color = isError ? "#dc2626" : "#0f766e";
}

function setMode(mode) {
  const loginMode = mode === "login";
  loginTab.classList.toggle("active", loginMode);
  registerTab.classList.toggle("active", !loginMode);
  loginForm.classList.toggle("hidden", !loginMode);
  registerForm.classList.toggle("hidden", loginMode);
  showMessage("");
}

loginTab.addEventListener("click", () => setMode("login"));
registerTab.addEventListener("click", () => setMode("register"));

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  showMessage("Signing in...");

  try {
    const { error: signInError } = await window.supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      showMessage(signInError.message, true);
      return;
    }

    // determine role and redirect
    const { data: userData } = await window.supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      window.location.href = "index.html";
      return;
    }

    const { data: profile, error: profileError } = await window.supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      // fallback to dashboard if profiles table not set yet
      window.location.href = "dashboard.html";
      return;
    }

    window.location.href = "dashboard.html";
  } catch (error) {
    showMessage("Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY in config.js", true);
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = document.getElementById("registerName").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;
  const monthlyAllowance = Number(document.getElementById("registerAllowance").value || 0);

  showMessage("Creating account...");
  try {
    const { data, error } = await window.supabase.auth.signUp({ email, password });

    if (error) {
      showMessage(error.message, true);
      return;
    }

    const userId = data.user?.id;
    if (!userId) {
      showMessage("User created. Please confirm your email and sign in.");
      return;
    }

    // create profile in new `profiles` table. default role = 'student'
    const { error: profileError } = await window.supabase.from("profiles").upsert({
      id: userId,
      name,
      email,
      role: "student",
      parent_id: null
    });

    if (profileError) {
      showMessage(`Account created, but profile setup failed: ${profileError.message}`, true);
      return;
    }

    // Ensure wallet exists for the student
    const { data: existingWallet } = await window.supabase.from("wallets").select("*").eq("user_id", userId).single();
    if (!existingWallet) {
      await window.supabase.from("wallets").insert({ user_id: userId, balance: 0 });
    }

    showMessage("Account created successfully. Redirecting...");
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 600);
  } catch (error) {
    showMessage("Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY in config.js", true);
  }
});

(async () => {
  try {
    const { data: { session } } = await window.supabase.auth.getSession();
    if (session) {
      const { data: userData } = await window.supabase.auth.getUser();
      const user = userData.user;
      if (user) {
        window.location.href = "dashboard.html";
      } else {
        window.location.href = "index.html";
      }
    }
  } catch (error) {
    console.warn("Supabase not configured:", error.message);
  }
})();
