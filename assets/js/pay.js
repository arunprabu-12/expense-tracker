// Payment Page State
let paymentState = {
  selectedCategory: null,
  selectedAmount: null,
  customAmount: null,
  userId: null,
  isProcessing: false
};

// Initialize supabase reference
const supabase = window.supabaseClient;

/**
 * Format currency value using global utility
 */
function formatCurrency(value) {
  return window.appUtils?.formatCurrency?.(value) || `₹${Number(value).toFixed(2)}`;
}

/**
 * Load wallet balance from Supabase
 */
async function loadWalletBalance() {
  try {
    if (!paymentState.userId) return;

    const { data: wallet, error } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", paymentState.userId)
      .single();

    if (error) {
      console.error("Error loading wallet:", error);
      document.getElementById("walletBalance").textContent = "₹0.00";
      return;
    }

    const balance = wallet?.balance ?? 0;
    document.getElementById("walletBalance").textContent = formatCurrency(balance);
  } catch (err) {
    console.error("Unexpected error loading wallet:", err);
  }
}

/**
 * Handle category button click
 */
function handleCategoryClick(category, buttonElement) {
  // Remove active state from all category buttons
  document.querySelectorAll(".category-button").forEach(btn => {
    btn.classList.remove("active");
  });

  // Add active state to clicked button
  buttonElement.classList.add("active");
  
  paymentState.selectedCategory = category;
  updatePaymentSummary();
  updatePayButton();
}

/**
 * Handle preset amount button click
 */
function handleAmountClick(amount, buttonElement) {
  // Remove active state from all amount buttons
  document.querySelectorAll(".amount-button").forEach(btn => {
    btn.classList.remove("active");
  });

  // Add active state to clicked button
  buttonElement.classList.add("active");
  
  paymentState.selectedAmount = amount;
  paymentState.customAmount = null;
  document.getElementById("customAmount").value = "";
  updatePaymentSummary();
  updatePayButton();
}

/**
 * Handle custom amount input
 */
function handleCustomAmountChange() {
  const customInput = document.getElementById("customAmount");
  const value = customInput.value.trim();

  // Remove active state from all preset amount buttons
  document.querySelectorAll(".amount-button").forEach(btn => {
    btn.classList.remove("active");
  });

  if (value && Number(value) > 0) {
    paymentState.customAmount = Number(value);
    paymentState.selectedAmount = null;
  } else {
    paymentState.customAmount = null;
  }

  updatePaymentSummary();
  updatePayButton();
}

/**
 * Update payment summary display
 */
function updatePaymentSummary() {
  const summaryBox = document.getElementById("paymentSummary");
  const categorySpan = document.getElementById("summaryCategory");
  const amountSpan = document.getElementById("summaryAmount");

  const hasCategory = paymentState.selectedCategory;
  const amount = paymentState.selectedAmount || paymentState.customAmount;
  const hasAmount = amount && amount > 0;

  if (hasCategory && hasAmount) {
    categorySpan.textContent = paymentState.selectedCategory;
    amountSpan.textContent = formatCurrency(amount);
    summaryBox.style.display = "block";
  } else {
    summaryBox.style.display = "none";
  }
}

/**
 * Update pay button state
 */
function updatePayButton() {
  const payButton = document.getElementById("payButton");
  const hasCategory = paymentState.selectedCategory;
  const amount = paymentState.selectedAmount || paymentState.customAmount;
  const hasAmount = amount && amount > 0;

  payButton.disabled = !hasCategory || !hasAmount || paymentState.isProcessing;
}

/**
 * Show success message
 */
function showSuccessMessage(amount, category) {
  const overlay = document.getElementById("overlay");
  const successMessage = document.getElementById("successMessage");
  const successDetails = document.getElementById("successDetails");

  successDetails.textContent = `${category} - ${formatCurrency(amount)}`;

  overlay.style.display = "block";
  successMessage.style.display = "block";

  // Auto-hide after 3 seconds and redirect
  setTimeout(() => {
    window.location.href = "student-dashboard.html";
  }, 3000);
}

/**
 * Show error message
 */
function showErrorMessage(message) {
  alert("❌ Payment Failed:\n" + message);
}

/**
 * Process payment - main logic
 */
async function processPayment() {
  try {
    // Validate state
    if (!paymentState.selectedCategory) {
      return showErrorMessage("Please select a category");
    }

    const amount = paymentState.selectedAmount || paymentState.customAmount;
    if (!amount || amount <= 0) {
      return showErrorMessage("Please select a valid amount");
    }

    if (!paymentState.userId) {
      return showErrorMessage("User not authenticated");
    }

    // Set processing state
    paymentState.isProcessing = true;
    const payButton = document.getElementById("payButton");
    const originalText = payButton.innerHTML;
    payButton.innerHTML = '<span class="loading-spinner"></span> Processing...';
    payButton.disabled = true;

    // 1. Fetch current wallet balance
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", paymentState.userId)
      .single();

    if (walletError) {
      throw new Error(`Failed to fetch wallet: ${walletError.message}`);
    }

    const currentBalance = Number(wallet?.balance ?? 0);

    // 2. Check if user has sufficient balance
    if (currentBalance < amount) {
      throw new Error(`Insufficient balance. Available: ${formatCurrency(currentBalance)}`);
    }

    // 3. Calculate new balance
    const newBalance = currentBalance - amount;

    // 4. Update wallet balance in Supabase
    const { error: updateError } = await supabase
      .from("wallets")
      .update({ balance: newBalance })
      .eq("user_id", paymentState.userId);

    if (updateError) {
      throw new Error(`Failed to update wallet: ${updateError.message}`);
    }

    // 5. Insert transaction record
    const today = new Date().toISOString().split("T")[0];
    const { error: transactionError } = await supabase
      .from("transactions")
      .insert({
        user_id: paymentState.userId,
        amount: amount,
        category: paymentState.selectedCategory,
        description: `Payment - ${paymentState.selectedCategory}`,
        type: "expense",
        date: today
      });

    if (transactionError) {
      // Rollback wallet update if transaction insert fails
      await supabase
        .from("wallets")
        .update({ balance: currentBalance })
        .eq("user_id", paymentState.userId);
      
      throw new Error(`Failed to record transaction: ${transactionError.message}`);
    }

    // 6. Show success message and redirect
    showSuccessMessage(amount, paymentState.selectedCategory);

  } catch (err) {
    console.error("Payment error:", err);
    showErrorMessage(err.message || "An unexpected error occurred");

    // Reset button state
    const payButton = document.getElementById("payButton");
    payButton.innerHTML = "<span id='payButtonText'>Complete Payment</span>";
    payButton.disabled = false;
    paymentState.isProcessing = false;
  }
}

/**
 * Application initialization
 */
async function initializePayPage() {
  try {
    // 1. Setup common layout (checks auth, shows user badge, etc.)
    const user = await window.common.setupCommonLayout();
    if (!user) {
      console.error("User not authenticated");
      return;
    }

    paymentState.userId = user.id;

    // 2. Load wallet balance
    await loadWalletBalance();

    // 3. Setup category button listeners
    document.querySelectorAll(".category-button").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        handleCategoryClick(btn.dataset.category, btn);
      });
    });

    // 4. Setup preset amount button listeners
    document.querySelectorAll(".amount-button").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        handleAmountClick(Number(btn.dataset.amount), btn);
      });
    });

    // 5. Setup custom amount input listener
    document.getElementById("customAmount").addEventListener("input", handleCustomAmountChange);

    // 6. Setup pay button listener
    document.getElementById("payButton").addEventListener("click", (e) => {
      e.preventDefault();
      if (!paymentState.isProcessing) {
        processPayment();
      }
    });

    console.log("Payment page initialized successfully");

  } catch (err) {
    console.error("Failed to initialize payment page:", err);
    showErrorMessage(err.message || "Failed to load payment page");
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", initializePayPage);

// Also run on script load (for consistency)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePayPage);
} else {
  initializePayPage();
}
