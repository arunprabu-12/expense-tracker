function txRow(t) {
  const tr = document.createElement("tr");
  const amountClass = t.type === "expense" ? "danger" : "success";
  const txDate = t.date ? new Date(t.date) : new Date(t.created_at);
  const date = txDate.toLocaleDateString();
  tr.innerHTML = `
    <td>${date}</td>
    <td>${t.type}</td>
    <td>${t.category || "-"}</td>
    <td class="${amountClass}">${window.appUtils.formatCurrency(t.amount)}</td>
  `;
  return tr;
}

async function renderStudentDashboard(userId) {
  const balEl = document.getElementById("walletBalance");
  const txBody = document.getElementById("transactionsBody");
  const predEl = document.getElementById("predictedSpending");
  const riskEl = document.getElementById("riskIndicator");

  const { data: wallet } = await window.supabase.from("wallets").select("balance").eq("user_id", userId).single();
  const balance = wallet?.balance ?? 0;
  balEl.textContent = window.appUtils.formatCurrency(balance);

  predEl.textContent = "Predicted next 7 days: -";
  riskEl.textContent = "Status: -";
  riskEl.className = "risk safe";

  const { data: transactions, error } = await window.supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false });

  if (error) {
    txBody.innerHTML = `<tr><td colspan="4">Failed to load transactions: ${error.message}</td></tr>`;
    return;
  }

  txBody.innerHTML = "";
  if (!transactions || transactions.length === 0) {
    txBody.innerHTML = `<tr><td colspan="4">No transactions yet.</td></tr>`;
    return;
  }

  transactions.forEach((t) => txBody.appendChild(txRow(t)));
}

function showPresetModal(category) {
  const modal = document.getElementById("presetModal");
  const title = document.getElementById("presetModalTitle");
  title.textContent = `Pay - ${category}`;
  modal.dataset.category = category;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function hidePresetModal() {
  const modal = document.getElementById("presetModal");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.querySelector(".preset-other").classList.add("hidden");
  document.getElementById("presetOtherInput").value = "";
}

async function doQuickPay(userId, category, amount) {
  const balEl = document.getElementById("walletBalance");
  const { data: wallet, error: walletErr } = await window.supabase.from("wallets").select("*").eq("user_id", userId).single();
  if (walletErr) return alert(`Failed to fetch wallet: ${walletErr.message}`);

  const balance = Number(wallet?.balance || 0);
  if (balance < amount) return alert("Insufficient balance");

  const newBalance = balance - amount;
  const modal = document.getElementById("presetModal");
  modal.querySelectorAll("button").forEach((b) => b.setAttribute("disabled", "true"));

  const { error: updateErr } = await window.supabase.from("wallets").update({ balance: newBalance }).eq("user_id", userId);
  if (updateErr) {
    modal.querySelectorAll("button").forEach((b) => b.removeAttribute("disabled"));
    return alert(`Failed to update wallet: ${updateErr.message}`);
  }

  const { error: txErr } = await window.supabase.from("transactions").insert({
    user_id: userId,
    amount,
    category,
    description: `Quick pay - ${category}`,
    type: "expense",
    date: new Date().toISOString().split("T")[0]
  });

  if (txErr) {
    await window.supabase.from("wallets").update({ balance }).eq("user_id", userId);
    modal.querySelectorAll("button").forEach((b) => b.removeAttribute("disabled"));
    return alert(`Payment failed: ${txErr.message}`);
  }

  balEl.textContent = window.appUtils.formatCurrency(newBalance);
  hidePresetModal();
  modal.querySelectorAll("button").forEach((b) => b.removeAttribute("disabled"));
  await renderStudentDashboard(userId);
}

(async () => {
  try {
    const user = await window.common.setupCommonLayout();
    if (!user) return;

    const { data: profile } = await window.supabase.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || profile.role !== "student") {
      window.location.href = "parent-dashboard.html";
      return;
    }

    await renderStudentDashboard(user.id);

    document.getElementById("quickPayGrid").addEventListener("click", (e) => {
      const btn = e.target.closest(".category-btn");
      if (!btn) return;
      e.preventDefault();
      showPresetModal(btn.dataset.category);
    });

    document.querySelectorAll(".preset-amount").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (btn.classList.contains("other")) {
          document.querySelector(".preset-other").classList.remove("hidden");
          document.getElementById("presetOtherInput").focus();
          return;
        }
        const amount = Number(btn.textContent.trim().replace(/[^0-9.]/g, ""));
        const category = document.getElementById("presetModal").dataset.category;
        doQuickPay(user.id, category, amount);
      });
    });

    document.getElementById("presetOtherPay").addEventListener("click", (e) => {
      e.preventDefault();
      const val = Number(document.getElementById("presetOtherInput").value);
      if (!val || val <= 0) return alert("Enter a valid amount");
      const category = document.getElementById("presetModal").dataset.category;
      doQuickPay(user.id, category, val);
    });

    document.getElementById("presetCancel").addEventListener("click", (e) => {
      e.preventDefault();
      hidePresetModal();
    });
    document.getElementById("presetClose").addEventListener("click", (e) => {
      e.preventDefault();
      hidePresetModal();
    });
    document.getElementById("presetBack").addEventListener("click", (e) => {
      e.preventDefault();
      hidePresetModal();
    });

    document.getElementById("presetModal").addEventListener("click", (e) => {
      if (e.target.id === "presetModal") {
        e.preventDefault();
        hidePresetModal();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !document.getElementById("presetModal").classList.contains("hidden")) {
        e.preventDefault();
        hidePresetModal();
      }
    });

    window.supabase
      .channel(`student-dashboard-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${user.id}` }, () => renderStudentDashboard(user.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${user.id}` }, () => renderStudentDashboard(user.id))
      .subscribe();
  } catch (err) {
    alert(`Failed to load student dashboard: ${err.message}`);
  }
})();
