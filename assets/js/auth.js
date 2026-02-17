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
    const { error } = await window.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      showMessage(error.message, true);
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

    const { error: profileError } = await window.supabase.from("users").upsert({
      id: userId,
      name,
      email,
      monthly_allowance: monthlyAllowance
    });

    if (profileError) {
      showMessage(`Account created, but profile setup failed: ${profileError.message}`, true);
      return;
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
      window.location.href = "dashboard.html";
    }
  } catch (error) {
    console.warn("Supabase not configured:", error.message);
  }
})();
