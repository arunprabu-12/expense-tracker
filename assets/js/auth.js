const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const authMessage = document.getElementById("authMessage");

// when the role selector changes we only require/ask for allowance if student
(function setupRoleToggle() {
  const roleSelect = document.getElementById("registerRole");
  const allowanceRow = document.getElementById("registerAllowanceRow");
  const allowanceInput = document.getElementById("registerAllowance");
  if (!roleSelect || !allowanceRow || !allowanceInput) return;

  function update() {
    const isStudent = roleSelect.value === "student";
    allowanceRow.style.display = isStudent ? "" : "none";
    allowanceInput.required = isStudent;
  }

  roleSelect.addEventListener("change", update);
  update();
})();

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

loginTab.addEventListener("click", (e) => {
  e.preventDefault();
  setMode("login");
});
registerTab.addEventListener("click", (e) => {
  e.preventDefault();
  setMode("register");
});

function redirectByRole(role) {
  const r = (role || "").toLowerCase();
  if (r === "parent") {
    window.location.href = "parent-dashboard.html";
    return;
  }
  window.location.href = "student-dashboard.html";
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const submitBtn = loginForm.querySelector("button[type='submit']");
  
  showMessage("Signing in...");
  const originalBtnText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in...";

  try {
    const { error: signInError } = await window.supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      showMessage(signInError.message, true);
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
      return;
    }

    const { data: userData } = await window.supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      window.location.href = "login.html"; // fallback to login
      return;
    }

    const { data: profile, error: profileError } = await window.supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.warn('Profile lookup error', profileError);
      showMessage('Login succeeded but profile not found. Please contact support.', true);
      return;
    }

    if (!profile) {
      showMessage('No profile associated with this account. Please register first.', true);
      return;
    }

    let role = (profile.role || '').toLowerCase().trim();
    if (!role) {
      showMessage('Your account does not have a role assigned. Contact support.', true);
      return;
    }

    if (role === 'student') {
      // offer to switch if they expected a parent account
      if (confirm('Your account is registered as a student. Change it to a parent account?')) {
        const { error: updErr } = await window.supabase.from('profiles').update({ role: 'parent' }).eq('id', user.id);
        if (!updErr) {
          role = 'parent';
        }
      }
    }

    redirectByRole(role);
  } catch (error) {
    showMessage("Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY in config.js", true);
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = document.getElementById("registerName").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const role = document.getElementById("registerRole").value;
  const password = document.getElementById("registerPassword").value;
  const submitBtn = registerForm.querySelector("button[type='submit']");

  showMessage("Creating account...");
  const originalBtnText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Creating account...";
  
  try {
    const { data, error } = await window.supabase.auth.signUp({ email, password });

    if (error) {
      showMessage(error.message, true);
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
      return;
    }

    const userId = data.user?.id;
    if (!userId) {
      showMessage("User created. Please confirm your email and sign in.");
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
      return;
    }

    const profileData = {
      id: userId,
      name,
      email,
      role,
      parent_id: null
    };
    if (role === "student") {
      const allowanceVal = Number(document.getElementById("registerAllowance").value);
      if (!isNaN(allowanceVal)) {
        profileData.monthly_limit = allowanceVal;
      }
    }

    const { error: profileError } = await window.supabase.from("profiles").upsert(profileData);

    if (profileError) {
      showMessage(`Account created, but profile setup failed: ${profileError.message}`, true);
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
      return;
    }

    if (role === "student") {
      const { data: existingWallet } = await window.supabase.from("wallets").select("*").eq("user_id", userId).single();
      if (!existingWallet) {
        await window.supabase.from("wallets").insert({ user_id: userId, balance: 0 });
      }
    }

    showMessage("Account created successfully. Redirecting...");
    setTimeout(() => redirectByRole(role), 600);
  } catch (error) {
    showMessage("Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY in config.js", true);
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  }
});

(async () => {
  try {
    const { data: { session } } = await window.supabase.auth.getSession();
    if (session) {
      const { data: userData } = await window.supabase.auth.getUser();
      const user = userData.user;
      if (user) {
        const { data: profile } = await window.supabase.from("profiles").select("role").eq("id", user.id).single();
        redirectByRole(profile?.role);
      } else {
        window.location.href = "login.html";
      }
    }
  } catch (error) {
    console.warn("Supabase not configured:", error.message);
  }
})();
