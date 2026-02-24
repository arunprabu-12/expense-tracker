function txRow(t) {
  const tr = document.createElement("tr");
  const amountClass = t.type === "expense" ? "danger" : "success";
  const txDate = t.date ? new Date(t.date) : new Date(t.created_at);
  const date = txDate.toLocaleDateString();
  tr.innerHTML = `
    <td>${date}</td>
    <td>${t.type}</td>
    <td>${t.category || "-"}</td>
    <td>${t.description || "-"}</td>
    <td class="${amountClass}">${window.appUtils.formatCurrency(t.amount)}</td>
  `;
  return tr;
}

// store all transactions so filters can operate
let allTransactions = [];

async function renderStudentDashboard(userId) {
  const balEl = document.getElementById("walletBalance");
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
    document.getElementById("transactionsBody").innerHTML = `<tr><td colspan=\"5\">Failed to load transactions: ${error.message}</td></tr>`;
    return;
  }

  allTransactions = transactions || [];
  populateCategoryFilter(allTransactions);
  applyFilters();
}

function populateCategoryFilter(transactions) {
  const sel = document.getElementById("filterCategory");
  const cats = [...new Set(transactions.map(t => t.category).filter(Boolean))];
  sel.innerHTML = '<option value="">All categories</option>' + cats.map(c=>`<option value="${c}">${c}</option>`).join('');
}

function applyFilters() {
  let filtered = [...allTransactions];
  const cat = document.getElementById("filterCategory").value;
  const type = document.getElementById("filterType").value;
  const from = document.getElementById("filterFrom").value;
  const to = document.getElementById("filterTo").value;
  const search = document.getElementById("searchInput").value.trim().toLowerCase();

  if (cat) filtered = filtered.filter(t=>t.category===cat);
  if (type) filtered = filtered.filter(t=>t.type===type);
  if (from) filtered = filtered.filter(t=>t.date>=from);
  if (to) filtered = filtered.filter(t=>t.date<=to);
  if (search) filtered = filtered.filter(t=>
    (t.category||"").toLowerCase().includes(search) ||
    (t.description||"").toLowerCase().includes(search)
  );

  renderTransactions(filtered);
  renderSummary(filtered);
  renderCharts(filtered);
}

function renderTransactions(transactions) {
  const txBody = document.getElementById("transactionsBody");
  txBody.innerHTML = "";
  if (!transactions || transactions.length === 0) {
    txBody.innerHTML = `<tr><td colspan=\"5\">No transactions match.</td></tr>`;
    return;
  }
  transactions.forEach(t=>txBody.appendChild(txRow(t)));
}

function renderSummary(transactions) {
  const monthStart = window.appUtils.startOfMonth();
  let spent = 0, received = 0;
  transactions.forEach(t=>{
    if (t.date >= monthStart) {
      if (t.type==='expense') spent += Number(t.amount||0);
      if (t.type==='income') received += Number(t.amount||0);
    }
  });
  document.getElementById("spentThisMonth").textContent = window.appUtils.formatCurrency(spent);
  document.getElementById("receivedThisMonth").textContent = window.appUtils.formatCurrency(received);
  document.getElementById("remainingThisMonth").textContent = window.appUtils.formatCurrency(received - spent);
  document.getElementById("analyticsSection").style.display = "block";
}

let categoryChartInstance = null;
let monthlyChartInstance = null;

function renderCharts(transactions) {
  try {
    if (typeof Chart === 'undefined') return; // skip if library missing

    // category pie
    const catMap = {};
    transactions.forEach(t=>{
      if (t.type==='expense') {
        catMap[t.category||'Uncategorized'] = (catMap[t.category||'Uncategorized']||0)+Number(t.amount||0);
      }
    });
    const catLabels = Object.keys(catMap);
    const catValues = Object.values(catMap);

    const ctx1 = document.getElementById("categoryChart").getContext("2d");
    if (categoryChartInstance) categoryChartInstance.destroy();
    categoryChartInstance = new Chart(ctx1, {
      type:'pie',
      data:{labels:catLabels.length?catLabels:['No Data'], datasets:[{data:catValues.length?catValues:[1], backgroundColor:['#0f766e','#2563eb','#f97316','#14b8a6','#f59e0b']}]}
    });

    // monthly bar
    const monthMap = {};
    transactions.forEach(t=>{
      const d=new Date(t.date);
      const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      monthMap[key]=(monthMap[key]||0)+Number(t.amount||0);
    });
    const mLabels = Object.keys(monthMap).sort();
    const mValues = mLabels.map(k=>monthMap[k]);
    const ctx2 = document.getElementById("monthlyChart").getContext("2d");
    if (monthlyChartInstance) monthlyChartInstance.destroy();
    monthlyChartInstance = new Chart(ctx2, {type:'bar', data:{labels:mLabels.length?mLabels:['No Data'], datasets:[{label:'Expenses',data:mValues.length?mValues:[0],backgroundColor:'#0f766e'}]}, options:{scales:{y:{beginAtZero:true}}}});
  } catch (chartErr) {
    console.error('renderCharts error', chartErr);
  }
}

function showPresetModal(category) {
  const modal = document.getElementById("presetModal");
  const title = document.getElementById("presetModalTitle");
  title.textContent = `Pay - ${category}`;
  modal.dataset.category = category;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  // always un-disable control buttons
  ["presetClose","presetBack","presetCancel"].forEach(id=>{
    const b=document.getElementById(id);
    if(b) b.removeAttribute('disabled');
  });
}

function hidePresetModal() {
  const modal = document.getElementById("presetModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }
  const other = document.querySelector(".preset-other");
  if (other) other.classList.add("hidden");
  const otherInput = document.getElementById("presetOtherInput");
  if (otherInput) otherInput.value = "";
}

// make sure close/back/cancel are always wired up and enabled early
(function setupModalControls() {
  const ids = ["presetClose", "presetBack", "presetCancel"];
  ids.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (id === 'presetBack') {
          // navigate to full pay page when user chooses "Back"
          window.location.href = 'pay.html';
        } else {
          hidePresetModal();
        }
      });
    }
  });
  // also ensure they are enabled whenever modal shows
  const origShow = showPresetModal;
  window.showPresetModal = function(category) {
    ids.forEach(i=>{
      const b=document.getElementById(i);
      if(b) b.removeAttribute('disabled');
    });
    origShow(category);
  };
})();

async function doQuickPay(userId, category, amount) {
  const balEl = document.getElementById("walletBalance");
  const { data: wallet, error: walletErr } = await window.supabase.from("wallets").select("*").eq("user_id", userId).single();
  if (walletErr) return alert(`Failed to fetch wallet: ${walletErr.message}`);

  const balance = Number(wallet?.balance || 0);
  if (balance < amount) return alert("Insufficient balance");

  const newBalance = balance - amount;
  const modal = document.getElementById("presetModal");
  // only disable the amount/payment buttons so user can still close or go back
  modal.querySelectorAll(".preset-amount, #presetOtherPay").forEach((b) => b.setAttribute("disabled", "true"));

  const { error: updateErr } = await window.supabase.from("wallets").update({ balance: newBalance }).eq("user_id", userId);
  if (updateErr) {
    modal.querySelectorAll(".preset-amount, #presetOtherPay").forEach((b) => b.removeAttribute("disabled"));
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
    modal.querySelectorAll(".preset-amount, #presetOtherPay").forEach((b) => b.removeAttribute("disabled"));
    return alert(`Payment failed: ${txErr.message}`);
  }

  balEl.textContent = window.appUtils.formatCurrency(newBalance);
  hidePresetModal();
  modal.querySelectorAll(".preset-amount, #presetOtherPay").forEach((b) => b.removeAttribute("disabled"));
  await renderStudentDashboard(userId);
}

(async () => {
  try {
    const user = await window.common.setupCommonLayout();
    if (!user) return;

    const profile = await window.common.loadCurrentUserProfile(user.id);
    if (!profile || (profile.role || "").toLowerCase() !== "student") {
      // if not a student, redirect to parent view
      window.location.href = "parent-dashboard.html";
      return;
    }

    await renderStudentDashboard(user.id);

    // allow manual refresh of the balance/transactions
    const refreshBtn = document.getElementById("refreshBalanceBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", (e) => {
        e.preventDefault();
        renderStudentDashboard(user.id);
      });
    }

    // anchor delegation is handled globally in common.js, no need to rebind here

    document.getElementById("quickPayGrid").addEventListener("click", (e) => {
      const btn = e.target.closest(".category-btn");
      if (!btn) return;
      e.preventDefault();
      const amount = btn.dataset.amount ? Number(btn.dataset.amount) : null;
      const category = btn.dataset.category;
      if (amount) {
        // quick shortcut with fixed amount
        doQuickPay(user.id, category, amount);
        return;
      }
      showPresetModal(category);
    });

    // filter/search handlers
    ["filterCategory","filterType","filterFrom","filterTo","searchInput"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', applyFilters);
    });
    const clearBtn = document.getElementById("clearFilters");
    if (clearBtn) clearBtn.addEventListener('click', () => {
      document.getElementById("filterCategory").value = '';
      document.getElementById("filterType").value = '';
      document.getElementById("filterFrom").value = '';
      document.getElementById("filterTo").value = '';
      document.getElementById("searchInput").value = '';
      applyFilters();
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
      window.location.href = 'pay.html';
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
