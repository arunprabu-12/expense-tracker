function txRow(t) {
  const tr = document.createElement("tr");
  const amountClass = t.type === "debit" ? "danger" : "success";
  const date = new Date(t.created_at || t.date || t.created_at).toLocaleString();
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

  const { data: wallet } = await window.supabase.from("wallets").select("balance").eq("student_id", userId).single();
  const balance = wallet?.balance ?? 0;
  balEl.textContent = window.appUtils.formatCurrency(balance);

  // fetch latest ML features/prediction for display
  try {
    const { data: mlrows, error: mlerr } = await window.supabase
      .from("ml_spending_features")
      .select("predicted_next_7_days, low_balance_risk, created_at")
      .eq("student_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (!mlerr && mlrows && mlrows.length > 0) {
      const rec = mlrows[0];
      predEl.textContent = `Predicted next 7 days: ${window.appUtils.formatCurrency(rec.predicted_next_7_days || 0)}`;
      if (rec.low_balance_risk) {
        riskEl.textContent = "Status: Critical";
        riskEl.className = "risk critical";
      } else {
        riskEl.textContent = "Status: Safe";
        riskEl.className = "risk safe";
      }
    } else {
      predEl.textContent = "Predicted next 7 days: —";
      riskEl.textContent = "Status: —";
      riskEl.className = "risk safe";
    }
  } catch (e) {
    // ignore
  }

  const { data: transactions, error } = await window.supabase
    .from("transactions")
    .select("*")
    .eq("student_id", userId)
    .order("created_at", { ascending: false });

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

// Quick Pay: show preset modal for a category
function showPresetModal(category) {
  const modal = document.getElementById("presetModal");
  const title = document.getElementById("presetModalTitle");
  title.textContent = `Pay — ${category}`;
  modal.dataset.category = category;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function hidePresetModal() {
  const modal = document.getElementById("presetModal");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  // reset other
  document.querySelector(".preset-other").classList.add("hidden");
  document.getElementById("presetOtherInput").value = "";
}

async function doQuickPay(userId, category, amount) {
  const balEl = document.getElementById("walletBalance");
  // fetch wallet to double-check balance
  const { data: wallet, error: walletErr } = await window.supabase.from("wallets").select("*").eq("student_id", userId).single();
  if (walletErr) return alert(`Failed to fetch wallet: ${walletErr.message}`);
  const balance = Number(wallet?.balance || 0);
  if (balance < amount) return alert("Insufficient balance");

  // perform update then insert transaction
  const newBalance = balance - amount;
  // disable modal buttons while processing
  const modal = document.getElementById("presetModal");
  modal.querySelectorAll("button").forEach((b) => b.setAttribute("disabled", "true"));

  const { error: updateErr } = await window.supabase.from("wallets").update({ balance: newBalance }).eq("student_id", userId);
  if (updateErr) {
    modal.querySelectorAll("button").forEach((b) => b.removeAttribute("disabled"));
    return alert(`Failed to update wallet: ${updateErr.message}`);
  }

  const { error: txErr } = await window.supabase.from("transactions").insert({
    student_id: userId,
    amount: amount,
    category,
    type: "debit",
    created_at: new Date().toISOString()
  });

  if (txErr) {
    // attempt to revert wallet update (best-effort)
    await window.supabase.from("wallets").update({ balance }).eq("student_id", userId);
    modal.querySelectorAll("button").forEach((b) => b.removeAttribute("disabled"));
    return alert(`Payment failed: ${txErr.message}`);
  }

  // success — update UI immediately
  balEl.textContent = window.appUtils.formatCurrency(newBalance);
  hidePresetModal();
  modal.querySelectorAll("button").forEach((b) => b.removeAttribute("disabled"));

  // prepend the new transaction locally for instant feedback
  const txBody = document.getElementById("transactionsBody");
  const latestTx = {
    created_at: new Date().toISOString(),
    type: "debit",
    category,
    amount
  };
  const newRow = txRow(latestTx);
  if (txBody.firstChild) txBody.insertBefore(newRow, txBody.firstChild);

  // show a temporary success message
  const success = document.createElement("div");
  success.className = "toast success";
  success.textContent = "Payment successful";
  document.body.appendChild(success);
  setTimeout(() => success.remove(), 2000);
}

(async () => {
  try {
    const user = await window.common.setupCommonLayout();
    if (!user) return;

    // ensure student role
    const { data: profile } = await window.supabase.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || profile.role !== "student") {
      window.location.href = "parent-dashboard.html";
      return;
    }

    await renderStudentDashboard(user.id);
    // Quick Pay handlers
    document.getElementById("quickPayGrid").addEventListener("click", (e) => {
      const btn = e.target.closest(".category-btn");
      if (!btn) return;
      const category = btn.dataset.category;
      showPresetModal(category);
    });

    // preset amount buttons
    document.querySelectorAll(".preset-amount").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const text = btn.textContent.trim();
        if (btn.classList.contains("other")) {
          document.querySelector(".preset-other").classList.remove("hidden");
          return;
        }
        const amount = Number(text.replace(/[^0-9.]/g, ""));
        const modal = document.getElementById("presetModal");
        const category = modal.dataset.category;
        doQuickPay(user.id, category, amount);
      });
    });

    // other pay / cancel
    document.getElementById("presetOtherPay").addEventListener("click", () => {
      const val = Number(document.getElementById("presetOtherInput").value);
      if (!val || val <= 0) return alert("Enter a valid amount");
      const modal = document.getElementById("presetModal");
      const category = modal.dataset.category;
      doQuickPay(user.id, category, val);
    });

    document.getElementById("presetCancel").addEventListener("click", () => hidePresetModal());

    // clicking outside modal content closes it
    document.getElementById("presetModal").addEventListener("click", (e) => {
      if (e.target.id === "presetModal") hidePresetModal();
    });

    window.supabase
      .channel(`student-dashboard-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets", filter: `student_id=eq.${user.id}` }, () => renderStudentDashboard(user.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `student_id=eq.${user.id}` }, () => renderStudentDashboard(user.id))
      .subscribe();
  } catch (err) {
    alert(`Failed to load student dashboard: ${err.message}`);
  }
})();
