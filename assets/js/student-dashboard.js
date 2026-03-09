(async () => {
  try {
    const user = await window.common.setupCommonLayout();
    if (!user) return;

    const profile = window.__currentUserProfile || {};
    if ((profile.role || '').toLowerCase() === 'parent') {
      // parents shouldn't see student page
      window.location.href = 'parent-dashboard.html';
      return;
    }

    async function loadBalance() {
      const { data, error } = await window.supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', user.id)
        .single();
      const bal = data?.balance || 0;
      document.getElementById('balanceValue').textContent = `\u20B9${bal.toFixed(2)}`;
    }

    function renderTransactions(rows) {
      const tbody = document.querySelector('#transactionsTable tbody');
      tbody.innerHTML = '';
      rows.forEach((t) => {
        const tr = document.createElement('tr');
        const d = new Date(t.date);
        tr.innerHTML = `
          <td>${d.toLocaleDateString()}</td>
          <td>${t.category || ''}</td>
          <td>${t.description || ''}</td>
          <td>\u20B9${Number(t.amount).toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    async function loadTransactions() {
      const { data, error } = await window.supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(50);
      if (error) {
        console.error('loadTransactions error', error);
        return;
      }
      renderTransactions(data || []);
      // refresh charts with expenses only
      const expenses = (data || []).filter((x) => x.type === 'expense');
      const totalsByCat = window.analytics.groupByCategory(expenses);
      const totalsByMonth = window.analytics.groupByMonth(expenses);
      window.analytics.renderCategoryChart(totalsByCat);
      window.analytics.renderMonthlyChart(totalsByMonth);
    }

    await loadBalance();
    await loadTransactions();

    // realtime updates
    window.supabase
      .channel(`student-trans-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'transactions',
        filter: `user_id=eq.${user.id}`
      }, () => {
        loadBalance();
        loadTransactions();
      })
      .subscribe();

    // expense form
    const expenseForm = document.getElementById('expenseForm');
    expenseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const category = document.getElementById('expenseCategory').value;
      const amount = parseFloat(document.getElementById('expenseAmount').value);
      const description = document.getElementById('expenseDescription').value.trim();
      if (!category || isNaN(amount) || amount <= 0) return;

      // insert transaction
      const { error: txError } = await window.supabase.from('transactions').insert([{ 
        user_id: user.id,
        amount,
        category,
        description,
        type: 'expense',
        date: new Date().toISOString().slice(0,10)
      }]);
      if (txError) {
        alert('Failed to record expense: ' + txError.message);
        return;
      }

      // deduct from wallet
      const { data: walletData, error: walletErr } = await window.supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', user.id)
        .single();
      let newBal = (walletData?.balance || 0) - amount;
      if (newBal < 0) newBal = 0;
      await window.supabase.from('wallets').update({ balance: newBal }).eq('user_id', user.id);

      // reset form and reload
      expenseForm.reset();
      await loadBalance();
      await loadTransactions();
    });
  } catch (err) {
    console.error('student dashboard error', err);
  }
})();