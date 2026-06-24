const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const SYMBOLS = ["RT9", "PLATIUM"];
const ASSET_META = {
  RT9: { name: "RT9", kind: "Share" },
  PLATIUM: { name: "Platium", kind: "Digital asset" },
};

const initialData = {
  prices: {
    RT9: { value: 125, history: [], updatedAt: new Date().toISOString() },
    PLATIUM: { value: 42, history: [], updatedAt: new Date().toISOString() },
  },
  users: [],
  coinRequests: [],
  transactions: [],
};

let data = loadData();
const sessions = new Map();
const adminSessions = new Set();
const sseClients = new Set();

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function now() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    return clone(initialData);
  }

  try {
    return migrate(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
  } catch {
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    return clone(initialData);
  }
}

function migrate(parsed) {
  const sourcePrices = parsed.prices || {};
  const users = (parsed.users || []).map((user) => {
    const rt9Qty = Number(user.holdings?.RT9?.quantity ?? user.shares?.RT9 ?? user.shares?.CCL ?? 0);
    const platiumQty = Number(user.holdings?.PLATIUM?.quantity ?? user.platium ?? user.shares?.FFL ?? 0);
    return {
      id: user.id || makeId("usr"),
      fullName: user.fullName || user.name || "",
      mobile: user.mobile || user.phone || "",
      address: user.address || user.location || "",
      pincode: user.pincode || "",
      username: String(user.username || user.mobile || user.phone || "").toLowerCase(),
      passwordHash: user.passwordHash || "",
      passwordSalt: user.passwordSalt || "",
      role: "user",
      status: user.status || "active",
      ccBalance: Number(user.ccBalance ?? user.ccCoins ?? user.rrCoins ?? 0),
      holdings: {
        RT9: { quantity: rt9Qty, avgCost: Number(user.holdings?.RT9?.avgCost || 0) },
        PLATIUM: { quantity: platiumQty, avgCost: Number(user.holdings?.PLATIUM?.avgCost || 0) },
      },
      createdAt: user.createdAt || now(),
      updatedAt: user.updatedAt || now(),
    };
  });

  const transactions = parsed.transactions || (parsed.trades || []).map((trade) => ({
    id: trade.id || makeId("txn"),
    userId: trade.userId,
    userName: trade.userName,
    type: "trade",
    symbol: trade.symbol === "CCL" ? "RT9" : "PLATIUM",
    action: trade.action,
    quantity: Number(trade.quantity || 0),
    price: Number(trade.price || 0),
    total: Number(trade.total || 0),
    createdAt: trade.createdAt || now(),
  }));

  return {
    prices: {
      RT9: normalizePrice(sourcePrices.RT9 || sourcePrices.CCL, 125),
      PLATIUM: normalizePrice(sourcePrices.PLATIUM || sourcePrices.FFL || sourcePrices.FCL, 42),
    },
    users,
    coinRequests: parsed.coinRequests || [],
    transactions,
  };
}

function normalizePrice(entry, fallback) {
  const value = Number(entry?.value || fallback);
  const updatedAt = entry?.updatedAt || now();
  const history = Array.isArray(entry?.history) ? entry.history.slice(-60) : [{ value, at: updatedAt }];
  return { value, history, updatedAt };
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function parseJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(payload));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 64, "sha512").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expected) {
  if (!salt || !expected) return false;
  const actual = hashPassword(password, salt).hash;
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function adminPasswordOk(password) {
  const adminHash = process.env.ADMIN_PASSWORD_HASH;
  const adminSalt = process.env.ADMIN_PASSWORD_SALT;
  if (adminHash && adminSalt) return verifyPassword(password, adminSalt, adminHash);
  if (process.env.ADMIN_PASSWORD) return String(password) === process.env.ADMIN_PASSWORD;
  return false;
}

function authToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function getUserFromToken(token) {
  const session = sessions.get(token);
  if (!session || session.role !== "user") return null;
  return data.users.find((user) => user.id === session.userId && user.status === "active");
}

function isAdmin(req) {
  return adminSessions.has(authToken(req));
}

function requireUser(req, res) {
  const user = getUserFromToken(authToken(req));
  if (!user) {
    sendJson(res, 401, { error: "Please log in again." });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  if (!isAdmin(req)) {
    sendJson(res, 401, { error: "Admin access is locked. Configure ADMIN_PASSWORD or ADMIN_PASSWORD_HASH." });
    return false;
  }
  return true;
}

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function cleanMobile(value) {
  return String(value || "").replace(/\D/g, "");
}

function cleanUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
}

function publicUser(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    mobile: user.mobile,
    address: user.address,
    pincode: user.pincode,
    username: user.username,
    status: user.status,
    ccBalance: user.ccBalance,
    holdings: user.holdings,
    portfolio: portfolioFor(user),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function portfolioFor(user) {
  const assets = {};
  let value = Number(user.ccBalance || 0);
  for (const symbol of SYMBOLS) {
    const holding = user.holdings[symbol] || { quantity: 0, avgCost: 0 };
    const price = Number(data.prices[symbol]?.value || 0);
    const marketValue = holding.quantity * price;
    const cost = holding.quantity * holding.avgCost;
    assets[symbol] = {
      ...ASSET_META[symbol],
      quantity: holding.quantity,
      avgCost: holding.avgCost,
      price,
      marketValue,
      profitLoss: marketValue - cost,
    };
    value += marketValue;
  }
  return { value, assets };
}

function userTransactions(userId) {
  return data.transactions.filter((txn) => txn.userId === userId).slice(-80).reverse();
}

function snapshotForUser(user) {
  return {
    prices: data.prices,
    user: publicUser(user),
    coinRequests: data.coinRequests.filter((request) => request.userId === user.id).slice(-20).reverse(),
    transactions: userTransactions(user.id),
  };
}

function adminSnapshot() {
  const users = data.users.map(publicUser);
  return {
    prices: data.prices,
    users,
    coinRequests: data.coinRequests.slice().reverse(),
    transactions: data.transactions.slice(-200).reverse(),
    analytics: {
      totalUsers: data.users.length,
      activeUsers: data.users.filter((user) => user.status === "active").length,
      totalTransactions: data.transactions.length,
      totalRT9: users.reduce((sum, user) => sum + user.holdings.RT9.quantity, 0),
      totalPlatium: users.reduce((sum, user) => sum + user.holdings.PLATIUM.quantity, 0),
      ccCirculation: users.reduce((sum, user) => sum + user.ccBalance, 0),
      pendingCoinRequests: data.coinRequests.filter((request) => request.status === "pending").length,
    },
  };
}

function broadcast() {
  const message = `data: ${JSON.stringify({
    prices: data.prices,
    version: Date.now(),
  })}\n\n`;
  for (const res of sseClients) res.write(message);
}

function addTransaction(entry) {
  data.transactions.push({
    id: makeId("txn"),
    createdAt: now(),
    ...entry,
  });
}

function buyAsset(user, symbol, quantity, price) {
  const holding = user.holdings[symbol];
  const total = price * quantity;
  const currentCost = holding.quantity * holding.avgCost;
  user.ccBalance -= total;
  holding.quantity += quantity;
  holding.avgCost = holding.quantity ? (currentCost + total) / holding.quantity : 0;
}

function sellAsset(user, symbol, quantity, price) {
  const holding = user.holdings[symbol];
  user.ccBalance += price * quantity;
  holding.quantity -= quantity;
  if (holding.quantity <= 0) {
    holding.quantity = 0;
    holding.avgCost = 0;
  }
}

function routeParts(url) {
  return url.pathname.split("/").filter(Boolean);
}

async function handleApi(req, res, url) {
  try {
    if (req.method === "GET" && url.pathname === "/api/stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      });
      sseClients.add(res);
      res.write(`data: ${JSON.stringify({ prices: data.prices, version: Date.now() })}\n\n`);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/register") {
      const body = await parseJson(req);
      const fullName = cleanText(body.fullName);
      const mobile = cleanMobile(body.mobile);
      const address = cleanText(body.address);
      const pincode = String(body.pincode || "").replace(/\D/g, "");
      const username = cleanUsername(body.username);
      const password = String(body.password || "");

      if (fullName.length < 2) return sendJson(res, 400, { error: "Enter the user's full name." });
      if (!/^[6-9]\d{9}$/.test(mobile)) return sendJson(res, 400, { error: "Enter a valid 10 digit mobile number." });
      if (address.length < 5) return sendJson(res, 400, { error: "Enter a complete address." });
      if (!/^\d{6}$/.test(pincode)) return sendJson(res, 400, { error: "Enter a valid 6 digit pincode." });
      if (username.length < 4) return sendJson(res, 400, { error: "Username must be at least 4 characters." });
      if (password.length < 8) return sendJson(res, 400, { error: "Password must be at least 8 characters." });
      if (data.users.some((user) => user.username === username)) return sendJson(res, 409, { error: "Username already exists." });
      if (data.users.some((user) => user.mobile === mobile)) return sendJson(res, 409, { error: "Mobile number already exists." });

      const { salt, hash } = hashPassword(password);
      const user = {
        id: makeId("usr"),
        fullName,
        mobile,
        address,
        pincode,
        username,
        passwordHash: hash,
        passwordSalt: salt,
        role: "user",
        status: "active",
        ccBalance: 0,
        holdings: {
          RT9: { quantity: 0, avgCost: 0 },
          PLATIUM: { quantity: 0, avgCost: 0 },
        },
        createdAt: now(),
        updatedAt: now(),
      };
      data.users.push(user);
      addTransaction({ userId: user.id, userName: user.fullName, type: "account", action: "registered", total: 0 });
      const token = makeId("usr_tok");
      sessions.set(token, { role: "user", userId: user.id });
      saveData();
      broadcast();
      return sendJson(res, 200, { token, snapshot: snapshotForUser(user) });
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      const body = await parseJson(req);
      const username = cleanUsername(body.username);
      const user = data.users.find((entry) => entry.username === username);
      if (!user || !verifyPassword(body.password || "", user.passwordSalt, user.passwordHash)) {
        return sendJson(res, 401, { error: "Wrong username or password." });
      }
      if (user.status !== "active") return sendJson(res, 403, { error: "This account is suspended." });
      const token = makeId("usr_tok");
      sessions.set(token, { role: "user", userId: user.id });
      return sendJson(res, 200, { token, snapshot: snapshotForUser(user) });
    }

    if (req.method === "GET" && url.pathname === "/api/me") {
      const user = requireUser(req, res);
      if (!user) return;
      return sendJson(res, 200, snapshotForUser(user));
    }

    if (req.method === "POST" && url.pathname === "/api/request-coins") {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await parseJson(req);
      const amount = Math.floor(Number(body.amount));
      if (!Number.isFinite(amount) || amount < 1 || amount > 1000000) {
        return sendJson(res, 400, { error: "Request an amount between 1 and 10,00,000 CC." });
      }

      data.coinRequests.push({
        id: makeId("req"),
        userId: user.id,
        userName: user.fullName,
        mobile: user.mobile,
        amount,
        status: "pending",
        createdAt: now(),
      });
      saveData();
      broadcast();
      return sendJson(res, 200, snapshotForUser(user));
    }

    if (req.method === "POST" && url.pathname === "/api/trade") {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await parseJson(req);
      const symbol = String(body.symbol || "").toUpperCase();
      const action = String(body.action || "").toLowerCase();
      const quantity = Math.floor(Number(body.quantity));
      if (!SYMBOLS.includes(symbol)) return sendJson(res, 400, { error: "Choose RT9 or Platium." });
      if (!["buy", "sell"].includes(action)) return sendJson(res, 400, { error: "Choose buy or sell." });
      if (!Number.isFinite(quantity) || quantity < 1 || quantity > 100000) return sendJson(res, 400, { error: "Quantity must be at least 1." });

      const price = Number(data.prices[symbol].value);
      const total = Math.round(price * quantity * 100) / 100;
      if (action === "buy" && user.ccBalance < total) return sendJson(res, 400, { error: "Not enough CC Coins. Ask coins from admin." });
      if (action === "sell" && user.holdings[symbol].quantity < quantity) return sendJson(res, 400, { error: `You do not have enough ${ASSET_META[symbol].name}.` });

      if (action === "buy") buyAsset(user, symbol, quantity, price);
      if (action === "sell") sellAsset(user, symbol, quantity, price);
      user.updatedAt = now();
      addTransaction({
        userId: user.id,
        userName: user.fullName,
        mobile: user.mobile,
        type: "trade",
        symbol,
        assetName: ASSET_META[symbol].name,
        action,
        quantity,
        price,
        total,
      });
      saveData();
      broadcast();
      return sendJson(res, 200, snapshotForUser(user));
    }

    if (req.method === "POST" && url.pathname === "/api/assistant") {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await parseJson(req);
      return sendJson(res, 200, { answer: assistantAnswer(body.message, user) });
    }

    if (req.method === "POST" && url.pathname === "/api/admin/login") {
      const body = await parseJson(req);
      if (!adminPasswordOk(body.password || "")) {
        return sendJson(res, 401, { error: "Wrong admin password or admin password is not configured." });
      }
      const token = makeId("adm_tok");
      adminSessions.add(token);
      return sendJson(res, 200, { token, snapshot: adminSnapshot() });
    }

    if (req.method === "GET" && url.pathname === "/api/admin") {
      if (!requireAdmin(req, res)) return;
      return sendJson(res, 200, adminSnapshot());
    }

    if (req.method === "POST" && url.pathname === "/api/admin/prices") {
      if (!requireAdmin(req, res)) return;
      const body = await parseJson(req);
      for (const symbol of SYMBOLS) {
        if (body[symbol] === undefined) continue;
        const value = Number(body[symbol]);
        if (!Number.isFinite(value) || value <= 0) return sendJson(res, 400, { error: `${ASSET_META[symbol].name} price must be above 0.` });
        const rounded = Math.round(value * 100) / 100;
        data.prices[symbol].value = rounded;
        data.prices[symbol].updatedAt = now();
        data.prices[symbol].history = [...(data.prices[symbol].history || []), { value: rounded, at: data.prices[symbol].updatedAt }].slice(-60);
      }
      saveData();
      broadcast();
      return sendJson(res, 200, adminSnapshot());
    }

    if (req.method === "POST" && url.pathname === "/api/admin/coin-request") {
      if (!requireAdmin(req, res)) return;
      const body = await parseJson(req);
      const request = data.coinRequests.find((entry) => entry.id === body.requestId);
      if (!request) return sendJson(res, 404, { error: "Coin request not found." });
      if (request.status !== "pending") return sendJson(res, 400, { error: "This request is already handled." });
      const user = data.users.find((entry) => entry.id === request.userId);
      if (!user) return sendJson(res, 404, { error: "User not found." });
      const decision = String(body.decision || "").toLowerCase();
      if (!["approve", "reject"].includes(decision)) return sendJson(res, 400, { error: "Choose approve or reject." });

      request.status = decision === "approve" ? "approved" : "rejected";
      request.resolvedAt = now();
      if (decision === "approve") {
        user.ccBalance += Number(request.amount);
        user.updatedAt = now();
        addTransaction({ userId: user.id, userName: user.fullName, type: "wallet", action: "coin_request_approved", total: request.amount });
      }
      saveData();
      broadcast();
      return sendJson(res, 200, adminSnapshot());
    }

    if (req.method === "POST" && url.pathname === "/api/admin/coins") {
      if (!requireAdmin(req, res)) return;
      const body = await parseJson(req);
      const user = data.users.find((entry) => entry.id === body.userId);
      const amount = Math.floor(Number(body.amount));
      const action = String(body.action || "").toLowerCase();
      if (!user) return sendJson(res, 404, { error: "User not found." });
      if (!Number.isFinite(amount) || amount < 1 || amount > 1000000) return sendJson(res, 400, { error: "Enter 1 to 10,00,000 CC." });
      if (!["add", "remove"].includes(action)) return sendJson(res, 400, { error: "Choose add or remove." });
      if (action === "remove" && user.ccBalance < amount) return sendJson(res, 400, { error: "User does not have enough CC." });
      user.ccBalance += action === "add" ? amount : -amount;
      user.updatedAt = now();
      addTransaction({ userId: user.id, userName: user.fullName, type: "wallet", action: `admin_${action}_coins`, total: amount });
      saveData();
      broadcast();
      return sendJson(res, 200, adminSnapshot());
    }

    if (req.method === "POST" && /^\/api\/admin\/users\/[^/]+\/status$/.test(url.pathname)) {
      if (!requireAdmin(req, res)) return;
      const [, , , userId] = routeParts(url);
      const body = await parseJson(req);
      const user = data.users.find((entry) => entry.id === userId);
      if (!user) return sendJson(res, 404, { error: "User not found." });
      const status = String(body.status || "").toLowerCase();
      if (!["active", "suspended"].includes(status)) return sendJson(res, 400, { error: "Choose active or suspended." });
      user.status = status;
      user.updatedAt = now();
      saveData();
      broadcast();
      return sendJson(res, 200, adminSnapshot());
    }

    if (req.method === "DELETE" && /^\/api\/admin\/users\/[^/]+$/.test(url.pathname)) {
      if (!requireAdmin(req, res)) return;
      const [, , , userId] = routeParts(url);
      data.users = data.users.filter((entry) => entry.id !== userId);
      data.coinRequests = data.coinRequests.filter((entry) => entry.userId !== userId);
      data.transactions = data.transactions.filter((entry) => entry.userId !== userId);
      saveData();
      broadcast();
      return sendJson(res, 200, adminSnapshot());
    }

    return sendJson(res, 404, { error: "API route not found." });
  } catch (error) {
    return sendJson(res, 500, { error: "Something went wrong. Please try again." });
  }
}

function assistantAnswer(message, user) {
  const text = String(message || "").toLowerCase();
  const portfolio = portfolioFor(user);
  if (text.includes("portfolio") || text.includes("summary")) {
    return `Your portfolio is worth ${formatCC(portfolio.value)}. You hold ${portfolio.assets.RT9.quantity} RT9 and ${portfolio.assets.PLATIUM.quantity} Platium with ${formatCC(user.ccBalance)} in wallet balance.`;
  }
  if (text.includes("profit") || text.includes("loss") || text.includes("p/l")) {
    const rt9 = portfolio.assets.RT9.profitLoss;
    const platium = portfolio.assets.PLATIUM.profitLoss;
    return `Current P/L: RT9 ${formatSigned(rt9)}, Platium ${formatSigned(platium)}. P/L compares your average buy cost with the live admin-controlled market price.`;
  }
  if (text.includes("rt9")) {
    return `RT9 is the only tradable share in MoneyTalks. Its live price is ${formatCC(data.prices.RT9.value)} and the admin controls every price update.`;
  }
  if (text.includes("platium")) {
    return `Platium is a digital investment asset bought and sold with CC Coins. Its live price is ${formatCC(data.prices.PLATIUM.value)} and you can sell your holding whenever you want.`;
  }
  if (text.includes("coin") || text.includes("wallet")) {
    return `CC Coins are the app wallet currency. Users cannot deposit directly, so use Ask Coins and wait for admin approval. Your current wallet balance is ${formatCC(user.ccBalance)}.`;
  }
  return "I can explain RT9, Platium, CC Coins, buy/sell orders, profit/loss, or summarize your portfolio. Ask me a trading question and I will keep it simple.";
}

function formatCC(value) {
  return `CC ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatSigned(value) {
  const prefix = value >= 0 ? "+" : "-";
  return `${prefix}${formatCC(Math.abs(value))}`;
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
    }[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "X-Content-Type-Options": "nosniff",
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) handleApi(req, res, url);
  else serveStatic(req, res, url);
});

function startServer(port = PORT, host = "0.0.0.0") {
  server.listen(port, host, () => {
    console.log(`MoneyTalks running at http://localhost:${port}`);
  });
}

if (require.main === module) startServer();

module.exports = { server, startServer, hashPassword };
