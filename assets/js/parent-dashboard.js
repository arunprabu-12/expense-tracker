async function renderStudents(parentId) {
  const studentsList = document.getElementById("studentsList");
  studentsList.textContent = "Loading...";

  const { data: students, error } = await window.supabase
    .from("profiles")
    .select("id, name, email")
    .eq("parent_id", parentId);

  if (error) {
    studentsList.textContent = `Failed to load students: ${error.message}`;
    return;
  }

  if (!students || students.length === 0) {
    studentsList.innerHTML = "<p>No linked students found. Ask students to set your account as parent.</p>";
    return;
  }

  studentsList.innerHTML = "";
  for (const s of students) {
    const card = document.createElement("div");
    card.className = "student-card";
    card.innerHTML = `
      <div class="student-row">
        <div>
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

  document.querySelectorAll("button[data-student-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sid = btn.getAttribute("data-student-id");
      const amountRaw = prompt("Enter amount to add to student's wallet:", "0");
      const amount = Number(amountRaw);
      if (!amount || amount <= 0) return alert("Invalid amount");

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

      await renderStudents(parentId);
    });
  });
}

(async () => {
  try {
    const user = await window.common.setupCommonLayout();
    if (!user) return;

    const { data: profile } = await window.supabase.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || profile.role !== "parent") {
      window.location.href = "student-dashboard.html";
      return;
    }

    await renderStudents(user.id);

    window.supabase
      .channel(`parent-dashboard-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets" }, () => renderStudents(user.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => renderStudents(user.id))
      .subscribe();
  } catch (err) {
    alert(`Failed to load parent dashboard: ${err.message}`);
  }
})();
