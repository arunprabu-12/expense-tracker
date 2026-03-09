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

// export helpers for other scripts
window.analytics = {
  groupByCategory,
  groupByMonth,
  renderCategoryChart,
  renderMonthlyChart,
  fetchAndRenderCharts
};

(async () => {
  try {
    const user = await window.common.setupCommonLayout();
    if (!user) return;

    // make sure links navigate
    document.querySelectorAll('a').forEach((anchor) => {
      anchor.addEventListener('click', (e) => {
        const href = anchor.getAttribute('href');
        if (href && !href.startsWith('#')) {
          e.preventDefault();
          window.location.href = href;
        }
      });
    });

    // if parent, we choose a child to show charts for (first match)
    let targetUserId = user.id;
    const roleRes = await window.supabase.from('profiles').select('role,parent_id,parent_email').eq('id', user.id).single();
    const role = roleRes.data?.role?.toLowerCase();
    if (role === 'parent') {
      // attempt to auto-link orphaned students as well
      try {
        await window.supabase
          .from('profiles')
          .update({ parent_id: user.id })
          .eq('parent_email', user.email);
      } catch (e) {
        console.warn('analytics auto-link error', e);
      }

      // fetch one student linked to us
      const filter = `parent_id.eq.${user.id},parent_email.eq.${JSON.stringify(
        user.email
      )}`;
      const { data: children } = await window.supabase
        .from('profiles')
        .select('id')
        .or(filter)
        .limit(1);
      if (children && children.length) {
        targetUserId = children[0].id;
      }
    }

    await fetchAndRenderCharts(targetUserId);

    window.supabase
      .channel(`analytics-transactions-${targetUserId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "transactions",
        filter: `user_id=eq.${targetUserId}`
      }, () => fetchAndRenderCharts(targetUserId))
      .subscribe();
  } catch (error) {
    // eslint-disable-next-line no-alert
    alert(`Failed to load analytics: ${error.message}`);
  }
})();
