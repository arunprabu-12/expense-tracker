let categoryChartInstance = null;
let monthlyChartInstance = null;

function groupByCategory(transactions) {
  const map = {};
  transactions.forEach((t) => {
    const key = t.category || "Uncategorized";
    map[key] = (map[key] || 0) + Number(t.amount || 0);
  });
  return map;
}

function groupByMonth(transactions) {
  const map = {};
  transactions.forEach((t) => {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map[key] = (map[key] || 0) + Number(t.amount || 0);
  });
  return map;
}

function renderCategoryChart(categoryTotals) {
  const ctx = document.getElementById("categoryChart").getContext("2d");
  if (categoryChartInstance) categoryChartInstance.destroy();

  const labels = Object.keys(categoryTotals);
  const values = Object.values(categoryTotals);

  categoryChartInstance = new Chart(ctx, {
    type: "pie",
    data: {
      labels: labels.length ? labels : ["No Data"],
      datasets: [{
        data: values.length ? values : [1],
        backgroundColor: [
          "#0f766e",
          "#2563eb",
          "#f97316",
          "#14b8a6",
          "#f59e0b",
          "#ef4444",
          "#8b5cf6"
        ]
      }]
    },
    options: {
      plugins: {
        legend: { position: "bottom" }
      }
    }
  });
}

function renderMonthlyChart(monthlyTotals) {
  const ctx = document.getElementById("monthlyChart").getContext("2d");
  if (monthlyChartInstance) monthlyChartInstance.destroy();

  const labels = Object.keys(monthlyTotals).sort();
  const values = labels.map((key) => monthlyTotals[key]);

  monthlyChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels.length ? labels : ["No Data"],
      datasets: [{
        label: "Expense Amount",
        data: values.length ? values : [0],
        backgroundColor: "#0f766e"
      }]
    },
    options: {
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

async function fetchAndRenderCharts(userId) {
  const { data, error } = await window.supabase
    .from("transactions")
    .select("amount, category, date, type")
    .eq("user_id", userId)
    .eq("type", "expense");

  if (error) {
    throw error;
  }

  const categoryTotals = groupByCategory(data);
  const monthlyTotals = groupByMonth(data);

  renderCategoryChart(categoryTotals);
  renderMonthlyChart(monthlyTotals);
}

(async () => {
  try {
    const user = await window.common.setupCommonLayout();
    if (!user) return;

    await fetchAndRenderCharts(user.id);

    window.supabase
      .channel(`analytics-transactions-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "transactions",
        filter: `user_id=eq.${user.id}`
      }, () => fetchAndRenderCharts(user.id))
      .subscribe();
  } catch (error) {
    // eslint-disable-next-line no-alert
    alert(`Failed to load analytics: ${error.message}`);
  }
})();
