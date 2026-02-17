const monthlyAllowanceEl = document.getElementById("monthlyAllowance");
const totalExpensesEl = document.getElementById("totalExpenses");
const remainingBalanceEl = document.getElementById("remainingBalance");
const dailyLimitEl = document.getElementById("dailyLimit");
const recentTransactionsEl = document.getElementById("recentTransactions");

function transactionRow(transaction) {
  const tr = document.createElement("tr");
  const amountClass = transaction.type === "expense" ? "danger" : "success";
  tr.innerHTML = `
    <td>${transaction.date}</td>
    <td><span class="type-pill ${transaction.type}">${transaction.type}</span></td>
    <td>${transaction.category || "-"}</td>
    <td>${transaction.description || "-"}</td>
    <td class="${amountClass}">${window.appUtils.formatCurrency(transaction.amount)}</td>
  `;
  return tr;
}

async function fetchAndRender(userId) {
  const userProfile = await window.common.loadCurrentUserProfile(userId);
  const monthlyAllowance = Number(userProfile.monthly_allowance || 0);

  const monthStart = window.appUtils.startOfMonth();
  const { data: transactions, error } = await window.supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .gte("date", monthStart)
    .order("date", { ascending: false });

  if (error) {
    throw error;
  }

  let expenses = 0;
  let incomes = 0;
  transactions.forEach((t) => {
    if (t.type === "expense") expenses += Number(t.amount || 0);
    if (t.type === "income") incomes += Number(t.amount || 0);
  });

  const effectiveBudget = monthlyAllowance + incomes;
  const remaining = effectiveBudget - expenses;
  const dailyLimit = remaining / window.appUtils.daysLeftInMonth();

  monthlyAllowanceEl.textContent = window.appUtils.formatCurrency(monthlyAllowance);
  totalExpensesEl.textContent = window.appUtils.formatCurrency(expenses);
  remainingBalanceEl.textContent = window.appUtils.formatCurrency(remaining);
  dailyLimitEl.textContent = window.appUtils.formatCurrency(dailyLimit);

  recentTransactionsEl.innerHTML = "";
  transactions.slice(0, 8).forEach((t) => recentTransactionsEl.appendChild(transactionRow(t)));
  if (transactions.length === 0) {
    recentTransactionsEl.innerHTML = `<tr><td colspan="5">No transactions yet.</td></tr>`;
  }
}

(async () => {
  try {
    const user = await window.common.setupCommonLayout();
    if (!user) return;
    await fetchAndRender(user.id);

    window.supabase
      .channel(`dashboard-transactions-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "transactions",
        filter: `user_id=eq.${user.id}`
      }, () => fetchAndRender(user.id))
      .subscribe();
  } catch (error) {
    // eslint-disable-next-line no-alert
    alert(`Failed to load dashboard: ${error.message}`);
  }
})();
