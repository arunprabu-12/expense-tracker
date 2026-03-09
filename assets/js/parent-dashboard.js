(async () => {
  try {
    const user = await window.common.setupCommonLayout();
    if (!user) return;

    const profile = window.__currentUserProfile || {};
    if ((profile.role || '').toLowerCase() !== 'parent') {
      // non-parents should see student dashboard
      window.location.href = 'student-dashboard.html';
      return;
    }

    const childSelect = document.getElementById('childSelect');
    const childSummary = document.getElementById('childSummary');
    const childNameEl = document.getElementById('childName');
    const childBalanceEl = document.getElementById('childBalance');
    const transactionsCard = document.getElementById('transactionsCard');
    const chartsSection = document.getElementById('chartsSection');
    let currentChildId = null;

    async function loadChildren() {
      // auto-link any orphaned students whose parent_email matches us
      try {
        await window.supabase
          .from('profiles')
          .update({ parent_id: user.id })
          .eq('parent_email', user.email);
      } catch (e) {
        console.warn('failed to auto-link orphans', e);
      }

      // fetch students either linked by parent_id or parent_email
      const filter = `parent_id.eq.${user.id},parent_email.eq.${JSON.stringify(
        user.email
      )}`;
      const { data, error } = await window.supabase
        .from('profiles')
        .select('id,name,email')
        .or(filter);
      if (error) {
        console.error('loadChildren error', error);
        return;
      }
      populateChildList(data || []);
    }

    function populateChildList(list) {
      const noChildrenMsg = document.getElementById('noChildrenMsg');
      childSelect.innerHTML = '';
      if (!list || !list.length) {
        const opt = document.createElement('option');
        opt.textContent = 'No linked students';
        opt.value = '';
        childSelect.appendChild(opt);
        childSelect.disabled = true;
        if (noChildrenMsg) noChildrenMsg.style.display = '';
        return;
      }
      if (noChildrenMsg) noChildrenMsg.style.display = 'none';
      list.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name || '(unnamed)'} <${c.email}>`;
        childSelect.appendChild(opt);
      });
      childSelect.disabled = false;
      // select first student by default
      currentChildId = childSelect.value;
      showChild(currentChildId);
    }

    async function showChild(childId) {
      if (!childId) return;
      currentChildId = childId;
      childSummary.style.display = '';
      transactionsCard.style.display = '';
      chartsSection.style.display = '';

      // lookup student basic info
      const { data: stud, error: studErr } = await window.supabase
        .from('profiles')
        .select('name,email')
        .eq('id', childId)
        .single();
      childNameEl.textContent = stud?.name || stud?.email || 'Student';

      // balance
      const { data: wdata } = await window.supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', childId)
        .single();
      const bal = wdata?.balance || 0;
      childBalanceEl.textContent = `\u20B9${bal.toFixed(2)}`;

      await loadTransactionsFor(childId);
      await renderChartsFor(childId);
    }

    childSelect.addEventListener('change', (e) => {
      const id = e.target.value;
      showChild(id);
    });

    async function loadTransactionsFor(uid) {
      const { data, error } = await window.supabase
        .from('transactions')
        .select('*')
        .eq('user_id', uid)
        .order('date', { ascending: false })
        .limit(50);
      if (error) {
        console.error('tx load error', error);
        return;
      }
      renderTransactions(data || []);
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
          <td>${t.type}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    async function renderChartsFor(uid) {
      const { data, error } = await window.supabase
        .from('transactions')
        .select('amount, category, date, type')
        .eq('user_id', uid)
        .eq('type', 'expense');
      if (error) {
        console.error('chart data error', error);
        return;
      }
      const byCat = window.analytics.groupByCategory(data);
      const byMonth = window.analytics.groupByMonth(data);
      window.analytics.renderCategoryChart(byCat);
      window.analytics.renderMonthlyChart(byMonth);
    }

    // add funds logic
    const addMoneyBtn = document.getElementById('addMoneyBtn');
    const addMoneyFormCard = document.getElementById('addMoneyFormCard');
    const addMoneyForm = document.getElementById('addMoneyForm');
    addMoneyBtn.addEventListener('click', () => {
      addMoneyFormCard.classList.remove('hidden');
    });
    addMoneyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amt = parseFloat(document.getElementById('addMoneyAmount').value);
      if (isNaN(amt) || amt <= 0 || !currentChildId) return;
      // update wallet
      const { data: wdata } = await window.supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', currentChildId)
        .single();
      let newBal = (wdata?.balance || 0) + amt;
      await window.supabase.from('wallets').update({ balance: newBal }).eq('user_id', currentChildId);
      // insert income transaction so student history reflects deposit
      await window.supabase.from('transactions').insert([{ 
        user_id: currentChildId,
        amount: amt,
        category: 'parent-deposit',
        description: 'Parent added funds',
        type: 'income',
        date: new Date().toISOString().slice(0,10)
      }]);
      addMoneyForm.reset();
      addMoneyFormCard.classList.add('hidden');
      await showChild(currentChildId);
    });

    await loadChildren();
  } catch (err) {
    console.error('parent dashboard error', err);
  }
})();