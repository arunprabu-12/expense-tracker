let selectedStudentId = null;
let parentAllTx = [];
let parentCategoryChart = null;
let parentMonthlyChart = null;

let latestStudents = [];

async function renderStudents(parentId) {
  const studentsList = document.getElementById("studentsList");
  studentsList.textContent = "Loading...";

  const { data: students, error } = await window.supabase
    .from("profiles")
    .select("id, name, email, monthly_limit")
    .eq("parent_id", parentId);

  if (error) {
    studentsList.textContent = `Failed to load students: ${error.message}`;
    return;
  }

  if (!students || students.length === 0) {
    studentsList.innerHTML = "<p>No linked students found. Ask students to set your account as parent.</p>";
    return;
  }

  latestStudents = students;
  studentsList.innerHTML = "";
  for (const s of students) {
    const card = document.createElement("div");
    card.className = "student-card";
    card.innerHTML = `
      <div class="student-row" data-student-id="${s.id}">
        <div style="cursor:pointer;">
          <div class="student-name">${s.name || s.email}</div>
          <div class="student-email">${s.email}</div>
        </div>
        <div class="student-actions">
          <div class="student-balance" id="balance-${s.id}">Balance: ...</div>
          <button class="btn btn-primary" data-student-id="${s.id}">Add Money</button>
        </div>
      </div>
    `;

    studentsList.appendChild(card);

    const { data: wallet } = await window.supabase.from("wallets").select("balance").eq("user_id", s.id).single();
    const balEl = document.getElementById(`balance-${s.id}`);
    const balance = Number(wallet?.balance || 0);
    balEl.textContent = `Balance: ${window.appUtils.formatCurrency(balance)}`;
  }

  // setup delegation for row clicks and add-money buttons
  studentsList.addEventListener('click', async (e) => {
    const row = e.target.closest('.student-row');
    if (row) {
      const sid = row.dataset.studentId;
      const student = latestStudents.find(st => st.id === sid);
      if (student) showStudentDetail(student);
      return;
    }

    const btn = e.target.closest('button[data-student-id]');
    if (btn) {
      e.stopPropagation();
      const sid = btn.getAttribute('data-student-id');
      const amountRaw = prompt("Enter amount to add to student's wallet:", "0");
      const amount = Number(amountRaw);
      if (!amount || amount <= 0) return alert("Invalid amount");

      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = "Processing...";

      try {
        const { data: existingWallet } = await window.supabase.from("wallets").select("*").eq("user_id", sid).single();
        if (!existingWallet) {
          await window.supabase.from("wallets").insert({ user_id: sid, balance: amount });
        } else {
          const newBalance = Number(existingWallet.balance || 0) + amount;
          await window.supabase.from("wallets").update({ balance: newBalance }).eq("user_id", sid);
        }

        await window.supabase.from("transactions").insert({
          user_id: sid,
          amount,
          category: "Added by Parent",
          description: "Wallet top-up by parent",
          type: "income",
          date: new Date().toISOString().split("T")[0]
        });

        alert("Amount added successfully!");
        await renderStudents(parentId);
      } catch (err) {
        alert(`Failed to add amount: ${err.message}`);
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  });
}

function showStudentDetail(student) {
  selectedStudentId = student.id;
  document.getElementById('studentDetail').classList.remove('hidden');
  document.getElementById('detailTitle').textContent = `${student.name || student.email} Details`;
  loadStudentData(student.id, student.monthly_limit);
}

function hideStudentDetail() {
  selectedStudentId = null;
  document.getElementById('studentDetail').classList.add('hidden');
}

async function loadStudentData(sid, limit) {
  const balEl = document.getElementById('balanceInfo');
  const limEl = document.getElementById('limitValue');
  limEl.textContent = limit != null ? window.appUtils.formatCurrency(limit) : 'unset';
  if (limit != null && limit > 0) {
    balEl.classList.toggle('danger', false);
  }

  const { data: wallet } = await window.supabase.from('wallets').select('balance').eq('user_id', sid).single();
  const bal = Number(wallet?.balance||0);
  balEl.textContent = `Balance: ${window.appUtils.formatCurrency(bal)}`;
  if (limit && bal < limit) {
    balEl.classList.add('danger');
  }

  // fetch transactions
  const { data: txs, error } = await window.supabase.from('transactions').select('*').eq('user_id', sid).order('date', {ascending:false});
  if (error) {return;}
  parentAllTx = txs || [];
  applyParentFilters();
}

function applyParentFilters() {
  let filtered = [...parentAllTx];
  const type = document.getElementById('parentFilterType').value;
  const from = document.getElementById('parentFilterFrom').value;
  const to = document.getElementById('parentFilterTo').value;
  const search = document.getElementById('parentSearch').value.trim().toLowerCase();

  if (type) filtered = filtered.filter(t=>t.type===type);
  if (from) filtered = filtered.filter(t=>t.date>=from);
  if (to) filtered = filtered.filter(t=>t.date<=to);
  if (search) filtered = filtered.filter(t=>
    (t.category||"").toLowerCase().includes(search) ||
    (t.description||"").toLowerCase().includes(search)
  );

  renderParentTransactions(filtered);
  renderParentSummary(filtered);
  renderParentCharts(filtered);
}

function renderParentTransactions(txs) {
  const body = document.getElementById('parentTxBody');
  body.innerHTML = '';
  if (!txs.length) {
    body.innerHTML = '<tr><td colspan="5">No transactions</td></tr>';
    return;
  }
  txs.forEach(t=>{
    const tr=document.createElement('tr');
    const amountClass=t.type==='expense'?'danger':'success';
    tr.innerHTML=`<td>${new Date(t.date).toLocaleDateString()}</td><td>${t.type}</td><td>${t.category||'-'}</td><td>${t.description||'-'}</td><td class="${amountClass}">${window.appUtils.formatCurrency(t.amount)}</td>`;
    body.appendChild(tr);
  });
}

function renderParentSummary(txs) {
  let spent=0, rec=0;
  txs.forEach(t=>{if(t.type==='expense')spent+=Number(t.amount||0);if(t.type==='income')rec+=Number(t.amount||0);});
  document.getElementById('parentSpent').textContent=window.appUtils.formatCurrency(spent);
  document.getElementById('parentReceived').textContent=window.appUtils.formatCurrency(rec);
  document.getElementById('parentCharts').style.display='block';
}

function renderParentCharts(txs) {
  const catMap={};
  const monthMap={};
  txs.forEach(t=>{
    if(t.type==='expense'){
      catMap[t.category||'Uncategorized']=(catMap[t.category||'Uncategorized']||0)+Number(t.amount||0);
    }
    const d=new Date(t.date);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    monthMap[key]=(monthMap[key]||0)+Number(t.amount||0);
  });
  const ctxC=document.getElementById('parentCategoryChart').getContext('2d');
  if(parentCategoryChart)parentCategoryChart.destroy();
  parentCategoryChart=new Chart(ctxC,{type:'pie',data:{labels:Object.keys(catMap).length?Object.keys(catMap):['No Data'],datasets:[{data:Object.values(catMap).length?Object.values(catMap):[1],backgroundColor:['#0f766e','#2563eb','#f97316','#14b8a6','#f59e0b']}]}});
  const ctxM=document.getElementById('parentMonthlyChart').getContext('2d');
  if(parentMonthlyChart)parentMonthlyChart.destroy();
  const mLabels=Object.keys(monthMap).sort();
  const mVals=mLabels.map(k=>monthMap[k]);
  parentMonthlyChart=new Chart(ctxM,{type:'bar',data:{labels:mLabels.length?mLabels:['No Data'],datasets:[{label:'Expenses',data:mVals.length?mVals:[0],backgroundColor:'#0f766e'}]},options:{scales:{y:{beginAtZero:true}}}});
}


(async () => {
  try {
    const user = await window.common.setupCommonLayout();
    if (!user) return;

    const profile = await window.common.loadCurrentUserProfile(user.id);
    if (!profile || (profile.role || "").toLowerCase() !== "parent") {
      alert('You do not have access to the parent dashboard. Redirecting to student view.');
      window.location.href = "student-dashboard.html";
      return;
    }

    await renderStudents(user.id);

    // anchor delegation is now done globally in common.js

    // parent filters and controls
    ["parentFilterType","parentFilterFrom","parentFilterTo","parentSearch"].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.addEventListener('input', applyParentFilters);
    });
    const clearBtn=document.getElementById('parentClear');
    if(clearBtn) clearBtn.addEventListener('click', ()=>{
      document.getElementById('parentFilterType').value='';
      document.getElementById('parentFilterFrom').value='';
      document.getElementById('parentFilterTo').value='';
      document.getElementById('parentSearch').value='';
      applyParentFilters();
    });
    document.getElementById('backToList').addEventListener('click', ()=>hideStudentDetail());
    document.getElementById('editLimit').addEventListener('click', async ()=>{
      if (!selectedStudentId) return;
      const raw = prompt('Set monthly spending limit (enter 0 to clear):','0');
      const val = Number(raw);
      if (isNaN(val)) return;
      await window.supabase.from('profiles').update({monthly_limit: val>0?val:null}).eq('id', selectedStudentId);
      // refresh data
      loadStudentData(selectedStudentId, val>0?val:null);
    });

    window.supabase
      .channel(`parent-dashboard-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets" }, () => {
        if (selectedStudentId) loadStudentData(selectedStudentId);
        renderStudents(user.id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
        if (selectedStudentId) loadStudentData(selectedStudentId);
        renderStudents(user.id);
      })
      .subscribe();
  } catch (err) {
    alert(`Failed to load parent dashboard: ${err.message}`);
  }
})();
