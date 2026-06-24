const state = {
  token: localStorage.getItem("moneyTalksUserToken") || "",
  adminToken: localStorage.getItem("moneyTalksAdminToken") || "",
  prices: { RT9: { value: 0, history: [] }, PLATIUM: { value: 0, history: [] } },
  user: null,
  admin: null,
  lastSubmitAction: "add",
};

const el = (id) => document.getElementById(id);
const cc = (value) => `CC ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const signed = (value) => `${value >= 0 ? "+" : "-"}${cc(Math.abs(value || 0))}`;
const when = (value) => new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#039;",
}[char]));

function showMessage(text, type = "ok") {
  const box = el("message");
  box.textContent = text;
  box.className = `message ${type === "error" ? "error" : ""}`;
  window.setTimeout(() => box.classList.add("hidden"), 3800);
}

async function api(path, options = {}, admin = false) {
  const token = admin ? state.adminToken : state.token;
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

function switchView(viewId) {
  document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
}

function switchSection(sectionId) {
  document.querySelectorAll(".mobile-nav button").forEach((button) => button.classList.toggle("active", button.dataset.section === sectionId));
  document.querySelectorAll(".mobile-section").forEach((section) => section.classList.toggle("active", section.id === sectionId));
}

function renderPrices(prices = state.prices) {
  state.prices = prices;
  el("rt9Price").textContent = cc(prices.RT9?.value);
  el("platiumPrice").textContent = cc(prices.PLATIUM?.value);
  el("rt9TradePrice").textContent = cc(prices.RT9?.value);
  el("platiumTradePrice").textContent = cc(prices.PLATIUM?.value);
  el("adminRT9").value = prices.RT9?.value || "";
  el("adminPlatium").value = prices.PLATIUM?.value || "";
  drawChart(el("rt9Chart"), prices.RT9?.history || [{ value: prices.RT9?.value || 0 }], "#21a67a");
  drawChart(el("platiumChart"), prices.PLATIUM?.history || [{ value: prices.PLATIUM?.value || 0 }], "#c58d2a");
}

function drawChart(canvas, history, color) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const points = history.length > 1 ? history : [...history, ...history];
  const values = points.map((point) => Number(point.value || 0));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--chart-bg").trim() || "#eef3f5";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    const y = height - ((value - min) / Math.max(max - min, 1)) * (height - 18) - 9;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function renderUser(snapshot) {
  state.user = snapshot.user;
  renderPrices(snapshot.prices);
  el("authPanel").classList.add("hidden");
  el("appPanel").classList.remove("hidden");

  const rt9 = state.user.portfolio.assets.RT9;
  const platium = state.user.portfolio.assets.PLATIUM;
  const totalPl = rt9.profitLoss + platium.profitLoss;

  el("portfolioValue").textContent = cc(state.user.portfolio.value);
  el("profileLine").textContent = `${state.user.fullName} · @${state.user.username}`;
  el("ccBalance").textContent = cc(state.user.ccBalance);
  el("rt9Qty").textContent = rt9.quantity;
  el("platiumQty").textContent = platium.quantity;
  el("totalPl").textContent = signed(totalPl);
  el("totalPl").className = totalPl >= 0 ? "positive" : "negative";
  el("rt9Holding").textContent = `${rt9.quantity} shares`;
  el("platiumHolding").textContent = `${platium.quantity} units`;
  el("rt9Pl").textContent = signed(rt9.profitLoss);
  el("platiumPl").textContent = signed(platium.profitLoss);
  el("rt9Pl").className = rt9.profitLoss >= 0 ? "positive" : "negative";
  el("platiumPl").className = platium.profitLoss >= 0 ? "positive" : "negative";

  el("requestList").innerHTML = snapshot.coinRequests.length
    ? snapshot.coinRequests.map(renderRequest).join("")
    : `<p class="muted">No coin requests yet.</p>`;

  el("userTransactions").innerHTML = snapshot.transactions.length
    ? snapshot.transactions.map(renderTransactionItem).join("")
    : `<p class="muted">No transactions yet.</p>`;

  el("profileDetails").innerHTML = `
    <div><span>Full Name</span><strong>${escapeHtml(state.user.fullName)}</strong></div>
    <div><span>Mobile</span><strong>${escapeHtml(state.user.mobile)}</strong></div>
    <div><span>Address</span><strong>${escapeHtml(state.user.address)}</strong></div>
    <div><span>Pincode</span><strong>${escapeHtml(state.user.pincode)}</strong></div>
    <div><span>Username</span><strong>@${escapeHtml(state.user.username)}</strong></div>
    <div><span>Status</span><strong>${escapeHtml(state.user.status)}</strong></div>
  `;
}

function renderRequest(request) {
  return `
    <div class="list-item">
      <div><strong>${cc(request.amount)}</strong><span>${request.userName ? ` requested by ${escapeHtml(request.userName)}` : " requested"}</span></div>
      <span class="badge ${request.status}">${request.status}</span>
      <small>${when(request.createdAt)}</small>
    </div>
  `;
}

function renderTransactionItem(txn) {
  const label = txn.type === "trade"
    ? `${txn.action} ${txn.quantity} ${txn.assetName || txn.symbol}`
    : txn.action.replaceAll("_", " ");
  return `
    <div class="list-item">
      <div><strong>${escapeHtml(label)}</strong><span>${txn.symbol ? ` at ${cc(txn.price)}` : ""}</span></div>
      <span>${cc(txn.total)}</span>
      <small>${when(txn.createdAt)}</small>
    </div>
  `;
}

function renderAdmin(snapshot) {
  state.admin = snapshot;
  renderPrices(snapshot.prices);
  el("adminLock").classList.add("hidden");
  el("adminPanel").classList.remove("hidden");

  el("analyticsGrid").innerHTML = [
    ["Users", snapshot.analytics.totalUsers],
    ["Transactions", snapshot.analytics.totalTransactions],
    ["RT9 Holdings", snapshot.analytics.totalRT9],
    ["Platium Holdings", snapshot.analytics.totalPlatium],
    ["CC Circulation", cc(snapshot.analytics.ccCirculation)],
    ["Pending Requests", snapshot.analytics.pendingCoinRequests],
  ].map(([label, value]) => `<article><small>${label}</small><strong>${value}</strong></article>`).join("");

  const search = el("userSearch").value.trim().toLowerCase();
  const users = search ? snapshot.users.filter((user) => [
    user.fullName,
    user.mobile,
    user.username,
    user.address,
    user.pincode,
  ].join(" ").toLowerCase().includes(search)) : snapshot.users;

  el("manualCoinUser").innerHTML = snapshot.users.map((user) => `<option value="${user.id}">${escapeHtml(user.fullName)} · ${escapeHtml(user.mobile)}</option>`).join("");
  el("adminRequests").innerHTML = renderAdminRequests(snapshot.coinRequests);
  el("adminUsers").innerHTML = renderUsers(users);
  el("adminTransactions").innerHTML = renderTransactions(snapshot.transactions);
}

function renderAdminRequests(requests) {
  const pending = requests.filter((request) => request.status === "pending");
  if (!pending.length) return `<p class="muted">No pending coin requests.</p>`;
  return pending.map((request) => `
    <div class="list-item">
      <div><strong>${escapeHtml(request.userName)}</strong><span>${escapeHtml(request.mobile)} · ${cc(request.amount)}</span></div>
      <small>${when(request.createdAt)}</small>
      <div class="row-actions">
        <button class="secondary tiny" data-approve="${request.id}">Approve</button>
        <button class="danger tiny" data-reject="${request.id}">Reject</button>
      </div>
    </div>
  `).join("");
}

function renderUsers(users) {
  if (!users.length) return `<p class="muted">No matching users.</p>`;
  return `
    <table>
      <thead>
        <tr><th>User</th><th>Mobile</th><th>Address</th><th>CC</th><th>RT9</th><th>Platium</th><th>P/L</th><th>Status</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${users.map((user) => {
          const pl = user.portfolio.assets.RT9.profitLoss + user.portfolio.assets.PLATIUM.profitLoss;
          return `
            <tr>
              <td><strong>${escapeHtml(user.fullName)}</strong><br><small>@${escapeHtml(user.username)} · ${when(user.createdAt)}</small></td>
              <td>${escapeHtml(user.mobile)}</td>
              <td>${escapeHtml(user.address)}<br><small>${escapeHtml(user.pincode)}</small></td>
              <td>${cc(user.ccBalance)}</td>
              <td>${user.holdings.RT9.quantity}</td>
              <td>${user.holdings.PLATIUM.quantity}</td>
              <td class="${pl >= 0 ? "positive" : "negative"}">${signed(pl)}</td>
              <td><span class="badge ${user.status}">${escapeHtml(user.status)}</span></td>
              <td>
                <div class="row-actions">
                  <button class="tiny ghost" data-status="${user.id}" data-next="${user.status === "active" ? "suspended" : "active"}">${user.status === "active" ? "Suspend" : "Activate"}</button>
                  <button class="tiny danger" data-delete="${user.id}">Delete</button>
                </div>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderTransactions(transactions) {
  if (!transactions.length) return `<p class="muted">No activity yet.</p>`;
  return `
    <table>
      <thead><tr><th>User</th><th>Type</th><th>Asset</th><th>Qty</th><th>Price</th><th>Total</th><th>Time</th></tr></thead>
      <tbody>
        ${transactions.map((txn) => `
          <tr>
            <td>${escapeHtml(txn.userName || "System")}</td>
            <td>${escapeHtml(String(txn.action || txn.type).replaceAll("_", " "))}</td>
            <td>${escapeHtml(txn.assetName || txn.symbol || "-")}</td>
            <td>${txn.quantity || "-"}</td>
            <td>${txn.price ? cc(txn.price) : "-"}</td>
            <td>${cc(txn.total)}</td>
            <td>${when(txn.createdAt)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function refreshUser() {
  if (!state.token) return;
  try {
    renderUser(await api("/api/me"));
  } catch {
    localStorage.removeItem("moneyTalksUserToken");
    state.token = "";
    el("authPanel").classList.remove("hidden");
    el("appPanel").classList.add("hidden");
  }
}

async function refreshAdmin() {
  if (!state.adminToken) return;
  try {
    renderAdmin(await api("/api/admin", {}, true));
  } catch {
    localStorage.removeItem("moneyTalksAdminToken");
    state.adminToken = "";
    el("adminLock").classList.remove("hidden");
    el("adminPanel").classList.add("hidden");
  }
}

function logoutUser() {
  localStorage.removeItem("moneyTalksUserToken");
  state.token = "";
  state.user = null;
  el("authPanel").classList.remove("hidden");
  el("appPanel").classList.add("hidden");
  showMessage("Logged out.");
}

function logoutAdmin() {
  localStorage.removeItem("moneyTalksAdminToken");
  state.adminToken = "";
  state.admin = null;
  el("adminPassword").value = "";
  el("adminLock").classList.remove("hidden");
  el("adminPanel").classList.add("hidden");
  showMessage("Admin panel locked.");
}

document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
document.querySelectorAll(".mobile-nav button").forEach((button) => button.addEventListener("click", () => switchSection(button.dataset.section)));

el("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("light");
  localStorage.setItem("moneyTalksTheme", document.body.classList.contains("light") ? "light" : "dark");
  renderPrices();
});

el("registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await api("/api/register", {
      method: "POST",
      body: JSON.stringify({
        fullName: el("fullName").value,
        mobile: el("mobile").value,
        address: el("address").value,
        pincode: el("pincode").value,
        username: el("username").value,
        password: el("password").value,
      }),
    });
    state.token = payload.token;
    localStorage.setItem("moneyTalksUserToken", state.token);
    renderUser(payload.snapshot);
    await refreshAdmin();
    showMessage("Account created.");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

el("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username: el("loginUsername").value, password: el("loginPassword").value }),
    });
    state.token = payload.token;
    localStorage.setItem("moneyTalksUserToken", state.token);
    renderUser(payload.snapshot);
    showMessage("Welcome back.");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

document.querySelectorAll(".trade-form").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const action = event.submitter?.dataset.action || "buy";
    const symbol = form.dataset.symbol;
    const qty = symbol === "RT9" ? el("rt9OrderQty").value : el("platiumOrderQty").value;
    try {
      renderUser(await api("/api/trade", {
        method: "POST",
        body: JSON.stringify({ symbol, action, quantity: qty }),
      }));
      await refreshAdmin();
      showMessage(`${action === "buy" ? "Bought" : "Sold"} ${symbol === "RT9" ? "RT9" : "Platium"}.`);
    } catch (error) {
      showMessage(error.message, "error");
    }
  });
});

el("coinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    renderUser(await api("/api/request-coins", {
      method: "POST",
      body: JSON.stringify({ amount: el("coinAmount").value }),
    }));
    await refreshAdmin();
    showMessage("Coin request sent.");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

el("assistantForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = el("assistantInput").value.trim();
  if (!message) return;
  el("assistantChat").insertAdjacentHTML("beforeend", `<div class="bubble user">${escapeHtml(message)}</div>`);
  el("assistantInput").value = "";
  try {
    const payload = await api("/api/assistant", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    el("assistantChat").insertAdjacentHTML("beforeend", `<div class="bubble ai">${escapeHtml(payload.answer)}</div>`);
    el("assistantChat").scrollTop = el("assistantChat").scrollHeight;
  } catch (error) {
    showMessage(error.message, "error");
  }
});

el("adminLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: el("adminPassword").value }),
    }, true);
    state.adminToken = payload.token;
    localStorage.setItem("moneyTalksAdminToken", state.adminToken);
    renderAdmin(payload.snapshot);
    showMessage("Admin panel unlocked.");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

el("priceForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    renderAdmin(await api("/api/admin/prices", {
      method: "POST",
      body: JSON.stringify({ RT9: el("adminRT9").value, PLATIUM: el("adminPlatium").value }),
    }, true));
    await refreshUser();
    showMessage("Live prices updated.");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

el("manualCoinForm").addEventListener("click", (event) => {
  if (event.target.dataset.action) state.lastSubmitAction = event.target.dataset.action;
});

el("manualCoinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    renderAdmin(await api("/api/admin/coins", {
      method: "POST",
      body: JSON.stringify({
        userId: el("manualCoinUser").value,
        amount: el("manualCoinAmount").value,
        action: state.lastSubmitAction,
      }),
    }, true));
    await refreshUser();
    showMessage("Wallet updated.");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

el("adminRequests").addEventListener("click", async (event) => {
  const approveId = event.target.dataset.approve;
  const rejectId = event.target.dataset.reject;
  if (!approveId && !rejectId) return;
  try {
    renderAdmin(await api("/api/admin/coin-request", {
      method: "POST",
      body: JSON.stringify({ requestId: approveId || rejectId, decision: approveId ? "approve" : "reject" }),
    }, true));
    await refreshUser();
    showMessage(approveId ? "Request approved." : "Request rejected.");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

el("adminUsers").addEventListener("click", async (event) => {
  try {
    if (event.target.dataset.status) {
      renderAdmin(await api(`/api/admin/users/${event.target.dataset.status}/status`, {
        method: "POST",
        body: JSON.stringify({ status: event.target.dataset.next }),
      }, true));
      showMessage("User status updated.");
    }
    if (event.target.dataset.delete && window.confirm("Delete this user and all related activity?")) {
      renderAdmin(await api(`/api/admin/users/${event.target.dataset.delete}`, { method: "DELETE" }, true));
      showMessage("User deleted.");
    }
  } catch (error) {
    showMessage(error.message, "error");
  }
});

el("userSearch").addEventListener("input", () => {
  if (state.admin) renderAdmin(state.admin);
});

el("userLogout").addEventListener("click", logoutUser);
el("adminLogout").addEventListener("click", logoutAdmin);
el("adminRefresh").addEventListener("click", refreshAdmin);

const stream = new EventSource("/api/stream");
stream.onmessage = (event) => {
  const payload = JSON.parse(event.data);
  if (payload.prices) renderPrices(payload.prices);
  refreshUser();
  refreshAdmin();
  el("liveStatus").textContent = "Live market connected";
};
stream.onerror = () => {
  el("liveStatus").textContent = "Reconnecting live market";
};

if (localStorage.getItem("moneyTalksTheme") === "light") document.body.classList.add("light");
refreshUser();
refreshAdmin();
