const transactionForm = document.getElementById("transactionForm");
const transactionMessage = document.getElementById("transactionMessage");
const dateInput = document.getElementById("date");
dateInput.value = new Date().toISOString().split("T")[0];

function showMessage(message, isError = false) {
  transactionMessage.textContent = message;
  transactionMessage.style.color = isError ? "#dc2626" : "#0f766e";
}

(async () => {
  const user = await window.common.setupCommonLayout();
  if (!user) return;

  transactionForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      user_id: user.id,
      amount: Number(document.getElementById("amount").value),
      category: document.getElementById("category").value.trim(),
      description: document.getElementById("description").value.trim(),
      date: document.getElementById("date").value,
      type: document.getElementById("type").value
    };

    if (!payload.amount || payload.amount <= 0) {
      showMessage("Amount must be greater than 0.", true);
      return;
    }

    const submitBtn = transactionForm.querySelector("button[type='submit']");
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    showMessage("Saving transaction...");
    const { error } = await window.supabase.from("transactions").insert(payload);
    if (error) {
      showMessage(error.message, true);
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
      return;
    }

    transactionForm.reset();
    dateInput.value = new Date().toISOString().split("T")[0];
    showMessage("Transaction saved successfully.");
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  });
})();
