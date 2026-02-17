async function doPayment(category) {
  const amountRaw = prompt(`Enter amount for ${category}:`, "0");
  const amount = Number(amountRaw);
  if (!amount || amount <= 0) return alert("Invalid amount");

  // get current user
  const user = await window.common.requireAuth();
  if (!user) return;

  // fetch wallet
  const { data: wallet, error: walletErr } = await window.supabase.from("wallets").select("*").eq("user_id", user.id).single();
  if (walletErr) return alert(`Failed to fetch wallet: ${walletErr.message}`);
  const balance = Number(wallet?.balance || 0);
  if (balance < amount) return alert("Insufficient balance");

  const newBalance = balance - amount;

  // update wallet
  const { error: updateErr } = await window.supabase.from("wallets").update({ balance: newBalance }).eq("user_id", user.id);
  if (updateErr) return alert(`Failed to update wallet: ${updateErr.message}`);

  // insert transaction
  const { error: txErr } = await window.supabase.from("transactions").insert({
    user_id: user.id,
    amount: amount,
    category,
    description: `Quick pay - ${category}`,
    type: "expense",
    date: new Date().toISOString().split("T")[0]
  });

  if (txErr) return alert(`Payment recorded but transaction insert failed: ${txErr.message}`);

  alert("Payment successful");
  window.location.href = "student-dashboard.html";
}

(async () => {
  try {
    const user = await window.common.setupCommonLayout();
    if (!user) return;

    document.querySelectorAll(".category").forEach((btn) => {
      btn.addEventListener("click", () => doPayment(btn.textContent.trim()));
    });
  } catch (err) {
    alert(`Failed to initialise pay page: ${err.message}`);
  }
})();
