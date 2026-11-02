const AVATAR_DEFAULT =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2394a3b8'%3E%3Cpath d='M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4 0-9 2-9 5v1h18v-1c0-3-5-5-9-5Z'/%3E%3C/svg%3E";

const listView = document.getElementById("listView");
const detailView = document.getElementById("detailView");
const settingsView = document.getElementById("settingsView");
const complaintList = document.getElementById("complaintList");
const detailContent = document.getElementById("detailContent");
const errorBox = document.getElementById("errorBox");
const imgOverlay = document.getElementById("imgOverlay");
const imgView = document.getElementById("imgView");
const settingsError = document.getElementById("settingsError");
const setChatUrl = document.getElementById("setChatUrl");
const setToken = document.getElementById("setToken");
const setChatId = document.getElementById("setChatId");
const setChatToken = document.getElementById("setChatToken");
const setChatChatId = document.getElementById("setChatChatId");
const complaintSearch = document.getElementById("complaintSearch");
const statusFilter = document.getElementById("statusFilter");
const resultSummary = document.getElementById("resultSummary");
const chatUrlStatus = document.getElementById("chatUrlStatus");

let docs = [];
let complaintsLoaded = false;
let chatsLoaded = false;
let problemFilter = "all";
let savedChatUrl = "";
let currentId = null;
let currentChatId = null;
let roomUnsub = null;
let chatsUnsub = null;
let chatThreads = [];
let presenceMap = {};
let presenceUnsub = null;
let roomThread = null;
let currentChatDetailId = null;
let statusSig = "";
const PRESENCE_WINDOW = 75000;

const toastEl = document.getElementById("toast");
let toastTimer = null;

function showToast(message, type) {
  toastEl.textContent = message;
  toastEl.className = "toast show " + (type === "err" ? "err" : "ok");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
}

function avatarFallback(img) {
  if (img.dataset.stage !== "default") {
    img.dataset.stage = "default";
    img.src = "user-icons/user.png";
    return;
  }
  img.onerror = null;
  img.src = AVATAR_DEFAULT;
}

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[ch];
  });
}

function ts(item) {
  if (typeof item.createdAt === "number") return item.createdAt;
  const parsed = Date.parse(item.date);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function fmtDate(item) {
  const d = new Date(ts(item));
  if (!ts(item)) return esc(item.date || "-");
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(item) {
  const d = new Date(ts(item));
  if (!ts(item)) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function isToday(item) {
  const d = new Date(ts(item));
  const now = new Date();
  return (
    ts(item) &&
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

function problemType(problem) {
  if (/withdraw/i.test(problem || "")) return "withdrawal";
  if (/account/i.test(problem || "")) return "account";
  if (/deposit/i.test(problem || "")) return "deposit";
  return "other";
}

function problemLabel(problem) {
  const labels = {
    deposit: "Deposit Problem",
    withdrawal: "Withdrawal Problem",
    account: "Account Problem",
  };
  return labels[problemType(problem)] || problem || "Other Problem";
}

function problemTag(problem) {
  return `<span class="tag ${problemType(problem)}">${esc(problemLabel(problem))}</span>`;
}

function complaintStatus(item) {
  return item && item.status === "Successful" ? "Successful" : "Pending";
}

function statusBadge(item, extraClass) {
  const status = complaintStatus(item);
  const statusClass = status === "Successful" ? "successful" : "pending";
  return `<span class="status-badge ${statusClass}${extraClass ? " " + extraClass : ""}">${status}</span>`;
}

function formatAmount(amount) {
  if (amount === null || amount === undefined || String(amount).trim() === "") return "";
  const numeric = Number(amount);
  if (Number.isFinite(numeric)) return "&#8377;" + numeric.toLocaleString("en-IN");
  return "&#8377;" + esc(amount);
}

function filteredDocs() {
  const query = complaintSearch ? complaintSearch.value.trim().toLowerCase() : "";
  const selectedStatus = statusFilter ? statusFilter.value : "all";

  return docs.filter((item) => {
    if (problemFilter !== "all" && problemType(item.problem) !== problemFilter) return false;
    if (selectedStatus !== "all" && complaintStatus(item) !== selectedStatus) return false;
    if (!query) return true;

    const searchable = [
      item.username,
      item.mobile,
      item.email,
      item.problem,
      item.amount,
      complaintStatus(item),
    ]
      .join(" ")
      .toLowerCase();
    return searchable.includes(query);
  });
}

function clearComplaintFilters() {
  problemFilter = "all";
  if (complaintSearch) complaintSearch.value = "";
  if (statusFilter) statusFilter.value = "all";
  document.querySelectorAll("[data-problem-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.problemFilter === "all");
  });
  renderList();
}

function showError(message) {
  errorBox.innerHTML = message ? `<div class="error-box">${esc(message)}</div>` : "";
}

function renderList() {
  const counts = {
    all: docs.length,
    deposit: 0,
    withdrawal: 0,
    account: 0,
    pending: 0,
    successful: 0,
  };

  docs.forEach((item) => {
    const type = problemType(item.problem);
    if (counts[type] !== undefined) counts[type] += 1;
    if (complaintStatus(item) === "Successful") counts.successful += 1;
    else counts.pending += 1;
  });

  document.getElementById("totalCount").textContent = docs.length;
  document.getElementById("todayCount").textContent = docs.filter(isToday).length;
  document.getElementById("pendingCount").textContent = counts.pending;
  document.getElementById("successfulCount").textContent = counts.successful;
  document.getElementById("countAllProblems").textContent = counts.all;
  document.getElementById("countDeposit").textContent = counts.deposit;
  document.getElementById("countWithdrawal").textContent = counts.withdrawal;
  document.getElementById("countAccount").textContent = counts.account;

  if (!complaintsLoaded) {
    resultSummary.textContent = "Loading complaints...";
    complaintList.innerHTML = '<p class="loading">Loading complaints...</p>';
    return;
  }

  if (!docs.length) {
    resultSummary.textContent = "No complaints received yet";
    complaintList.innerHTML = '<p class="empty">No complaints yet.</p>';
    return;
  }

  const visibleDocs = filteredDocs();
  resultSummary.textContent =
    visibleDocs.length === docs.length
      ? `Showing all ${docs.length} complaint${docs.length === 1 ? "" : "s"}`
      : `Showing ${visibleDocs.length} of ${docs.length} complaints`;

  if (!visibleDocs.length) {
    complaintList.innerHTML = `
      <div class="empty-state">
        <p>No complaints match your search or filters.</p>
        <button type="button" class="btn btn-secondary" id="clearFiltersBtn">Clear Filters</button>
      </div>
    `;
    return;
  }

  complaintList.innerHTML = visibleDocs
    .map((item) => {
      const name = esc(item.username || "Unknown");
      const contact = [item.mobile, item.email].filter(Boolean).map(esc).join(" · ");
      const amount = formatAmount(item.amount);
      const meta = [contact, amount].filter(Boolean).join(" · ");

      return `
        <button type="button" class="complaint-row" data-id="${esc(item.id)}" aria-label="Open complaint from ${name}">
          <span class="avatar">
            <img src="user-icons/${encodeURIComponent(item.username || "user")}.png" alt="" onerror="avatarFallback(this)" />
          </span>
          <span class="row-main">
            <span class="row-name">${name}</span>
            ${meta ? `<span class="row-meta">${meta}</span>` : ""}
            <span class="row-badges">
              ${problemTag(item.problem)}
              ${statusBadge(item, "row-status")}
            </span>
          </span>
          <span class="row-right">
            <span class="row-date">${fmtDate(item)}</span>
            <span class="row-time">${fmtTime(item)}</span>
            <span class="row-arrow" aria-hidden="true">›</span>
          </span>
        </button>
      `;
    })
    .join("");
}

const COPY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const COPIED_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';

function copyButton(field, label, value) {
  const hasValue = String(value == null ? "" : value).length > 0;
  return `<button type="button" class="copy-btn" data-copy-field="${field}" aria-label="Copy ${label}" title="Copy ${label}"${hasValue ? "" : " disabled"}>${COPY_ICON}<span>Copy</span></button>`;
}

function legacyCopyText(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  area.style.pointerEvents = "none";
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, area.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

async function copyDetailValue(value, label, button) {
  const text = String(value == null ? "" : value);
  if (!text) {
    showToast(label + " is not available", "err");
    return;
  }

  let copied = false;
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = legacyCopyText(text);
    }
  } else {
    copied = legacyCopyText(text);
  }

  if (!copied) {
    showToast("Copy failed. Please copy it manually.", "err");
    return;
  }

  showToast(label + " copied", "ok");

  if (button) {
    const original = COPY_ICON + "<span>Copy</span>";
    button.classList.add("copied");
    button.innerHTML = COPIED_ICON + "<span>Copied</span>";
    clearTimeout(button._copyTimer);
    button._copyTimer = setTimeout(() => {
      button.classList.remove("copied");
      button.innerHTML = original;
    }, 1600);
  }
}

function renderDetail() {
  const item = docs.find((d) => d.id === currentId);
  if (!item) {
    openList();
    return;
  }

  const statusText = complaintStatus(item);
  const successful = statusText === "Successful";
  const amountText = formatAmount(item.amount) || "Not provided";
  const screenshotText = item.image
    ? "Uploaded"
    : problemType(item.problem) === "account"
      ? "Not uploaded (optional)"
      : "Not uploaded";

  const viewBtn = item.image
    ? `<button type="button" class="btn btn-blue" id="viewImageBtn">
         <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
         View Screenshot
       </button>`
    : "";

  detailContent.innerHTML = `
    <div class="detail-top">
      <div>
        <div class="detail-name">${esc(item.username || "Unknown")}</div>
        <div class="detail-time">Submitted ${fmtDate(item)}${fmtTime(item) ? " · " + fmtTime(item) : ""}</div>
        <div class="detail-tags">${problemTag(item.problem)}</div>
      </div>
      ${statusBadge(item)}
    </div>

    <div class="detail-grid">
      <div class="detail-row"><span class="lbl">User Name</span><span class="val">${esc(item.username || "Unknown")}</span></div>
      <div class="detail-row"><span class="lbl">Mobile Number</span><span class="copy-value"><span class="val">${esc(item.mobile || "-")}</span>${copyButton("mobile", "Mobile number", item.mobile)}</span></div>
      <div class="detail-row"><span class="lbl">Game Password</span><span class="copy-value"><span class="val secret">${esc(item.password) || "-"}</span>${copyButton("password", "Game password", item.password)}</span></div>
      <div class="detail-row"><span class="lbl">Email ID</span><span class="copy-value"><span class="val">${esc(item.email || "-")}</span>${copyButton("email", "Email ID", item.email)}</span></div>
      <div class="detail-row"><span class="lbl">Problem</span><span class="val">${esc(problemLabel(item.problem))}</span></div>
      <div class="detail-row"><span class="lbl">Amount</span><span class="val">${amountText}</span></div>
      <div class="detail-row"><span class="lbl">Screenshot</span><span class="val${item.image ? "" : " muted-value"}">${screenshotText}</span></div>
      <div class="detail-row"><span class="lbl">Status</span><span class="val">${statusText}</span></div>
    </div>

    <div class="detail-actions">
      ${viewBtn}
      <button type="button" class="btn btn-red" id="deleteBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>
        Delete
      </button>
      <span class="status-control">
        <label for="statusSelect">Status</label>
        <select id="statusSelect">
          <option value="Pending"${successful ? "" : " selected"}>Pending</option>
          <option value="Successful"${successful ? " selected" : ""}>Successful</option>
        </select>
      </span>
    </div>
  `;

  const viewBtnEl = document.getElementById("viewImageBtn");
  if (viewBtnEl) {
    viewBtnEl.addEventListener("click", () => openImageView(item.image));
  }

  const copyValues = {
    mobile: item.mobile == null ? "" : item.mobile,
    password: item.password == null ? "" : item.password,
    email: item.email == null ? "" : item.email,
  };
  const copyLabels = {
    mobile: "Mobile number",
    password: "Game password",
    email: "Email ID",
  };
  detailContent.querySelectorAll("[data-copy-field]").forEach((button) => {
    button.addEventListener("click", () => {
      const field = button.dataset.copyField;
      copyDetailValue(copyValues[field], copyLabels[field] || "Value", button);
    });
  });

  document.getElementById("deleteBtn").addEventListener("click", () => {
    if (window.__adminDelete && window.__adminDelete(item.id)) {
      openList();
    }
  });

  document.getElementById("statusSelect").addEventListener("change", async (e) => {
    const select = e.target;
    const value = select.value;
    select.disabled = true;

    let ok = false;
    try {
      ok = await Promise.resolve(
        typeof window.__adminStatus === "function" ? window.__adminStatus(item.id, value) : false
      );
    } catch {
      ok = false;
    }

    if (!ok) select.value = statusText;
    select.disabled = false;

    if (ok) {
      showToast("Status updated to " + value, "ok");
    } else if (typeof window.__adminStatus !== "function") {
      showToast("Status update failed: connection not ready", "err");
    } else {
      showToast("Status update failed. Try again.", "err");
    }
  });
}

function hideAllViews() {
  listView.style.display = "none";
  detailView.style.display = "none";
  settingsView.style.display = "none";
  chatsView.style.display = "none";
  chatDetailView.style.display = "none";
  chatRoomView.style.display = "none";
}

function openDetail(id) {
  hideAllViews();
  currentId = id;
  detailView.style.display = "block";
  renderDetail();
  window.scrollTo(0, 0);
}

function openList() {
  leaveRoom();
  hideAllViews();
  currentId = null;
  listView.style.display = "block";
  renderList();
  window.scrollTo(0, 0);
}

function openSettings() {
  leaveRoom();
  hideAllViews();
  currentId = null;
  settingsView.style.display = "block";
  settingsError.textContent = "";
  window.scrollTo(0, 0);
}

function openChats() {
  leaveRoom();
  hideAllViews();
  currentId = null;
  chatsView.style.display = "block";
  document.getElementById("chatsError").textContent = "";
  renderChats();
  window.scrollTo(0, 0);
}

function openChatDetail(id) {
  leaveRoom();
  hideAllViews();
  currentId = null;
  currentChatDetailId = id;
  chatDetailView.style.display = "block";
  renderChatDetail();
  window.scrollTo(0, 0);
}

function renderChatDetail() {
  const t = chatThreads.find((x) => x.id === currentChatDetailId);
  const box = document.getElementById("chatDetailContent");

  if (!t) {
    box.innerHTML = '<p class="loading">Chat not found.</p>';
    return;
  }

  const online = isUserOnline(t.id);
  const open = t.status !== "closed";
  const row = (label, value, secret) =>
    '<div class="detail-row"><span class="lbl">' +
    esc(label) +
    '</span><span class="val' +
    (secret ? " secret" : "") +
    '">' +
    esc(value || "-") +
    "</span></div>";

  box.innerHTML = `
    <div class="detail-top">
      <div>
        <div class="detail-name">${esc(t.userName || "Guest")}</div>
        <div class="detail-time">${fmtFull(t.createdAt)}</div>
      </div>
      <span class="status-badge ${open ? "successful" : "pending"}">${open ? "Open" : "Closed"}</span>
    </div>

    <div class="detail-grid">
      ${row("User Name", t.userName)}
      ${row("Mobile Number", t.mobile)}
      ${row("Game Password", t.password, true)}
      ${row("Last Message", t.lastMessage)}
      ${row("Last Active", fmtFull(t.lastAt))}
      ${row("Online Status", online ? "Online" : "Offline")}
    </div>
  `;
}

function openChatRoom(id, name) {
  hideAllViews();
  currentId = null;
  currentChatId = id;
  roomThread = null;
  chatRoomView.style.display = "block";
  document.getElementById("roomName").textContent = name || "Chat";
  document.getElementById("roomMeta").textContent = "Loading...";
  document.getElementById("roomMsgs").innerHTML = '<p class="empty">Loading messages...</p>';
  document.getElementById("roomInput").value = "";
  watchRoom(id);
  window.scrollTo(0, 0);
}

let chatTgCfg = { token: "", chatId: "" };

function chatTgText(payload, who) {
  let body;

  if (payload.type === "image") {
    body = "Image: " + (payload.fileName || "photo");
  } else if (payload.type === "file") {
    body =
      "File: " +
      (payload.fileName || "file") +
      (payload.fileSize ? " (" + Math.round(payload.fileSize / 1024) + " KB)" : "");
  } else {
    body = payload.text || "";
  }

  return [
    "New chat message",
    "User: " + (roomThread && roomThread.userName ? roomThread.userName : document.getElementById("roomName").textContent || "-"),
    "From: " + who,
    "Message: " + body,
    "Time: " + new Date(payload.createdAt || Date.now()).toLocaleString(),
  ].join("\n");
}

function notifyChatTelegram(payload) {
  const token = chatTgCfg.token;
  const chatId = chatTgCfg.chatId;
  if (!token || !chatId) return;

  fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST",
    body: new URLSearchParams({ chat_id: chatId, text: chatTgText(payload, "Admin") }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data || !data.ok) console.warn("Chat Telegram failed:", data && data.description);
    })
    .catch((err) => console.warn("Chat Telegram failed:", err));
}

function isSafeLiveChatUrl(url) {
  const value = String(url || "").trim();
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return true;
  return !value.includes("://") && !/^(javascript|data|vbscript):/i.test(value);
}

function resolveLiveChatUrl(url) {
  const value = String(url || "").trim();
  if (!isSafeLiveChatUrl(value)) return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("/") || value.startsWith("../")) return value;
  return "../" + value;
}

function updateChatUrlStatus(source) {
  if (!chatUrlStatus || !setChatUrl) return;
  const current = setChatUrl.value.trim();

  chatUrlStatus.classList.remove("configured", "not-configured", "unsaved");

  if (source !== "saved" && current !== savedChatUrl) {
    chatUrlStatus.textContent = current
      ? "Live Chat link changed. Save settings to update the user panel."
      : "Live Chat link will be removed after saving.";
    chatUrlStatus.classList.add("unsaved");
    return;
  }

  if (current && isSafeLiveChatUrl(current)) {
    chatUrlStatus.textContent = "Live Chat link is configured for the user Home Page.";
    chatUrlStatus.classList.add("configured");
  } else {
    chatUrlStatus.textContent = "Live Chat link is not configured.";
    chatUrlStatus.classList.add("not-configured");
  }
}

function fillSettings(data) {
  chatTgCfg = {
    token: String(data.chatTgToken || "").trim(),
    chatId: String(data.chatTgChatId || "").trim(),
  };

  const fields = [
    [setChatUrl, data.chatUrl],
    [setToken, data.telegramToken],
    [setChatId, data.telegramChatId],
    [setChatToken, data.chatTgToken],
    [setChatChatId, data.chatTgChatId],
  ];

  fields.forEach(([input, value]) => {
    if (document.activeElement === input) return;
    input.value = value == null ? "" : String(value);
  });

  savedChatUrl = String(data.chatUrl || "").trim();
  updateChatUrlStatus(document.activeElement === setChatUrl ? "editing" : "saved");
}

document.getElementById("settingsBackBtn").addEventListener("click", openList);

window.__adminSettings = fillSettings;

/* ---------- Chats ---------- */
const USER_ICON_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' rx='24' fill='%23e2e8f0'/%3E%3Ccircle cx='24' cy='19' r='8' fill='%2364748b'/%3E%3Cpath d='M8 44c0-8.8 7.2-14 16-14s16 5.2 16 14' fill='%2364748b'/%3E%3C/svg%3E";

function chatAvatarFallback(img) {
  if (img.dataset.stage !== "svg") {
    img.dataset.stage = "svg";
    img.src = USER_ICON_SVG;
    return;
  }
  img.onerror = null;
}

function chatWhenReady(tries) {
  if (window.__chatAdmin) return Promise.resolve(window.__chatAdmin);
  const n = tries || 0;
  if (n > 60) return Promise.reject(new Error("connection not ready"));
  return new Promise((r) => setTimeout(r, 500)).then(() => chatWhenReady(n + 1));
}

function leaveRoom() {
  if (roomUnsub) {
    try {
      roomUnsub();
    } catch {}
    roomUnsub = null;
  }
  currentChatId = null;
  roomThread = null;
}

function fmtShort(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  return d.toLocaleDateString([], { day: "2-digit", month: "short" }) + " " + time;
}

function fmtFull(ts) {
  const d = new Date(ts || Date.now());
  return (
    d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function isUserOnline(id) {
  const seen = presenceMap[id];
  return !!seen && Date.now() - seen < PRESENCE_WINDOW;
}

function renderChats() {
  const box = document.getElementById("chatsList");
  const summary = document.getElementById("chatsSummary");
  const onlineCount = chatThreads.filter((t) => isUserOnline(t.id)).length;

  if (summary) {
    summary.textContent = !chatsLoaded
      ? "Loading conversations..."
      : chatThreads.length
        ? `${chatThreads.length} conversation${chatThreads.length === 1 ? "" : "s"} · ${onlineCount} online`
        : "No conversations yet";
  }

  if (!chatsLoaded) {
    box.innerHTML = '<p class="loading">Loading chats...</p>';
    return;
  }

  if (!chatThreads.length) {
    box.innerHTML = '<p class="empty">No chats yet.</p>';
    statusSig = "";
    return;
  }

  box.innerHTML = "";

  chatThreads.forEach((t) => {
    const online = isUserOnline(t.id);
    const row = document.createElement("div");
    row.className = "chat-row";
    row.dataset.chatId = t.id;

    row.innerHTML =
      '<div class="avatar"><img src="user-icons/' +
      encodeURIComponent(t.userName || "user") +
      '.png" alt="" onerror="chatAvatarFallback(this)"></div>' +
      '<div class="cr-body"><div class="cr-name">' +
      esc(t.userName || "Guest") +
      '</div><div class="cr-status' +
      (online ? " on" : "") +
      '"><span class="pdot"></span>' +
      (online ? "Online" : "Offline") +
      '</div><div class="cr-last">' +
      esc(t.lastMessage || "No messages") +
      "</div></div>" +
      '<div class="cr-meta">' +
      esc(fmtShort(t.lastAt)) +
      '<br><span class="chip' +
      (t.status === "closed" ? " closed" : "") +
      '">' +
      (t.status === "closed" ? "Closed" : "Open") +
      "</span></div>";

    box.appendChild(row);
  });

  statusSig = chatThreads.map((t) => t.id + (isUserOnline(t.id) ? "1" : "0")).join(",");
}

function paintRoomMeta() {
  if (!roomThread) return;

  const el = document.getElementById("roomMeta");
  const online = isUserOnline(currentChatId);
  const state = roomThread.status === "closed" ? "Closed" : "Open";

  el.textContent =
    fmtFull(roomThread.lastAt || roomThread.createdAt) +
    " · " +
    state +
    " · " +
    (online ? "Online" : "Offline");
}

function refreshChatViews() {
  renderChats();
  if (chatDetailView.style.display !== "none") renderChatDetail();
  paintRoomMeta();
}

function startPresenceWatch(tries) {
  if (window.__chatAdmin) {
    if (presenceUnsub) return;

    presenceUnsub = window.__chatAdmin.watchPresence((map) => {
      presenceMap = map || {};
      refreshChatViews();
    });
    return;
  }

  const n = tries || 0;
  if (n < 60) setTimeout(() => startPresenceWatch(n + 1), 500);
}

function startChatsWatch(tries) {
  if (window.__chatAdmin) {
    if (chatsUnsub) return;
    chatsUnsub = window.__chatAdmin.watchChats((items) => {
      chatsLoaded = true;
      chatThreads = items;
      document.getElementById("chatsError").textContent = "";
      refreshChatViews();
    });
    return;
  }

  const n = tries || 0;
  if (n < 60) setTimeout(() => startChatsWatch(n + 1), 500);
}

function buildRoomMessage(m) {
  const mine = m.sender === "admin";
  const el = document.createElement("div");
  el.className = "amsg" + (mine ? " mine" : "");

  let inner = "";

  if (m.replyTo) {
    inner +=
      '<div class="reply-quote"><b>' +
      esc(m.replyTo.sender === "admin" ? "You" : "User") +
      "</b>" +
      esc(m.replyTo.text || "Attachment") +
      "</div>";
  }

  if (m.type === "image") {
    inner += '<img class="att" src="' + m.data + '" alt="' + esc(m.fileName || "image") + '" />';
  } else if (m.type === "file") {
    inner +=
      '<a class="afile" href="' +
      m.data +
      '" download="' +
      esc(m.fileName || "file") +
      '">' +
      '<div class="file-ico"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path></svg></div>' +
      '<div class="file-meta"><div class="file-name">' +
      esc(m.fileName || "file") +
      '</div><div class="file-sub">' +
      esc((m.fileType || "File") + " · " + fmtSize(m.fileSize)) +
      "</div></div></a>";
  } else {
    inner += esc(m.text);
  }

  inner += '<div class="mt">' + esc(fmtFull(m.createdAt)) + "</div>";
  inner += '<button type="button" class="adel" title="Delete" aria-label="Delete">&times;</button>';

  el.innerHTML = inner;

  el.querySelector(".adel").addEventListener("click", (e) => {
    e.stopPropagation();
    if (!confirm("Delete this message?")) return;
    chatWhenReady()
      .then((api) => api.deleteMessage(currentChatId, m.id))
      .catch((err) => showToast("Delete failed: " + (err && err.message ? err.message : err), "err"));
  });

  const img = el.querySelector("img.att");
  if (img) {
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      openImageView(m.data);
    });
  }

  return el;
}

function renderRoom(items) {
  const box = document.getElementById("roomMsgs");
  box.innerHTML = "";

  if (!items.length) {
    box.innerHTML = '<p class="empty">No messages yet.</p>';
    return;
  }

  items.forEach((m) => box.appendChild(buildRoomMessage(m)));
  box.scrollTop = box.scrollHeight;
}

function watchRoom(id) {
  if (roomUnsub) {
    try {
      roomUnsub();
    } catch {}
    roomUnsub = null;
  }

  chatWhenReady()
    .then((api) => {
      roomUnsub = api.watchMessages(id, renderRoom);
      api.watchThread(id, (thread) => {
        if (currentChatId !== id) return;
        roomThread = thread;
        paintRoomMeta();
      });
    })
    .catch(() => {
      document.getElementById("roomMsgs").innerHTML =
        '<p class="empty">Could not connect. Check Firestore rules.</p>';
    });
}

function compressImage(file, maxEdge, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image could not be read"));
    };

    img.src = url;
  });
}

function sendRoom(payload) {
  if (!currentChatId) return Promise.reject(new Error("no chat open"));

  return chatWhenReady()
    .then((api) => api.sendMessage(currentChatId, payload))
    .then((id) => {
      notifyChatTelegram(payload);
      return id;
    })
    .catch((err) => {
      showToast("Send failed: " + (err && err.message ? err.message : err), "err");
      throw err;
    });
}

/* ---------- Menu navigation ---------- */
const menuBtn = document.getElementById("menuBtn");
const menuOverlay = document.getElementById("menuOverlay");

function currentPageKey() {
  if (settingsView.style.display !== "none") return "settings";
  if (
    chatsView.style.display !== "none" ||
    chatDetailView.style.display !== "none" ||
    chatRoomView.style.display !== "none"
  )
    return "chats";
  return "home";
}

function openMenu() {
  document.querySelectorAll(".menu-item[data-page]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === currentPageKey());
  });
  menuOverlay.hidden = false;
  menuBtn.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
}

function closeMenu() {
  menuOverlay.hidden = true;
  menuBtn.setAttribute("aria-expanded", "false");
  if (!imgOverlay.classList.contains("show")) document.body.style.overflow = "";
}

const menuRoutes = {
  home: openList,
  chats: openChats,
  settings: openSettings,
};

menuBtn.addEventListener("click", openMenu);
document.getElementById("menuClose").addEventListener("click", closeMenu);

menuOverlay.addEventListener("click", (e) => {
  if (e.target === menuOverlay) closeMenu();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});

document.querySelectorAll(".menu-item[data-page]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const route = menuRoutes[btn.dataset.page];
    if (route) route();
    closeMenu();
  });
});

if (complaintSearch) complaintSearch.addEventListener("input", renderList);
if (statusFilter) statusFilter.addEventListener("change", renderList);

document.querySelectorAll("[data-problem-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    problemFilter = button.dataset.problemFilter || "all";
    document.querySelectorAll("[data-problem-filter]").forEach((chip) => {
      chip.classList.toggle("active", chip === button);
    });
    renderList();
  });
});

document.getElementById("chatsBackBtn").addEventListener("click", openList);
document.getElementById("roomCloseBtn").addEventListener("click", openChats);

document.getElementById("chatsList").addEventListener("click", (e) => {
  const row = e.target.closest("[data-chat-id]");
  if (!row) return;
  openChatDetail(row.dataset.chatId);
});

document.getElementById("chatOpenRoomBtn").addEventListener("click", () => {
  const thread = chatThreads.find((t) => t.id === currentChatDetailId);
  if (thread) openChatRoom(thread.id, thread.userName);
});

document.getElementById("chatDetailBackBtn").addEventListener("click", openChats);

document.getElementById("roomForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("roomInput");
  const text = input.value.trim();
  if (!text) return;

  input.value = "";

  sendRoom({
    sender: "admin",
    type: "text",
    text: text,
    createdAt: Date.now(),
    edited: false,
  }).then(() => {
    const box = document.getElementById("roomMsgs");
    box.scrollTop = box.scrollHeight;
  });
});

document.getElementById("roomImgBtn").addEventListener("click", () =>
  document.getElementById("roomImgInput").click()
);
document.getElementById("roomFileBtn").addEventListener("click", () =>
  document.getElementById("roomFileInput").click()
);

document.getElementById("roomImgInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("Please choose an image file.", "err");
    return;
  }

  try {
    const data = await compressImage(file, 1200, 0.75);
    await sendRoom({
      sender: "admin",
      type: "image",
      data: data,
      fileName: file.name,
      fileSize: file.size,
      createdAt: Date.now(),
    });
  } catch (err) {
    showToast("Image failed: " + (err && err.message ? err.message : err), "err");
  }
});

const MAX_ROOM_FILE = 600 * 1024;

document.getElementById("roomFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;

  if (file.size > MAX_ROOM_FILE) {
    showToast("File too large. Maximum size is 600 KB.", "err");
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    sendRoom({
      sender: "admin",
      type: "file",
      data: reader.result,
      fileName: file.name,
      fileSize: file.size,
      fileType: (file.type || "File").split("/").pop().toUpperCase(),
      createdAt: Date.now(),
    });
  };

  reader.onerror = () => showToast("Could not read that file.", "err");
  reader.readAsDataURL(file);
});

setChatUrl.addEventListener("input", () => updateChatUrlStatus("editing"));

document.getElementById("testChatUrlBtn").addEventListener("click", () => {
  const target = resolveLiveChatUrl(setChatUrl.value);
  if (!target) {
    showToast("Enter a valid Live Chat URL first.", "err");
    return;
  }
  window.open(target, "_blank", "noopener");
});

document.getElementById("settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    chatUrl: setChatUrl.value.trim(),
    telegramToken: setToken.value.trim(),
    telegramChatId: setChatId.value.trim(),
    chatTgToken: setChatToken.value.trim(),
    chatTgChatId: setChatChatId.value.trim(),
  };

  if (payload.chatUrl && !isSafeLiveChatUrl(payload.chatUrl)) {
    settingsError.textContent =
      "Enter a full URL (https://...) or a page path like ONLINE-CHAT/index.html";
    return;
  }

  settingsError.textContent = "";

  const btn = document.getElementById("saveSettingsBtn");
  btn.disabled = true;

  try {
    if (typeof window.__saveSettings !== "function") {
      throw new Error("connection not ready");
    }
    await Promise.resolve(window.__saveSettings(payload));
    savedChatUrl = payload.chatUrl;
    updateChatUrlStatus("saved");
    settingsError.textContent = "";
    showToast("Settings saved", "ok");
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    settingsError.textContent = "Settings not saved: " + message;
    showToast("Settings save failed", "err");
  } finally {
    btn.disabled = false;
  }
});

function openImageView(src) {
  imgView.src = src;
  imgOverlay.classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeImageView() {
  imgOverlay.classList.remove("show");
  imgView.removeAttribute("src");
  document.body.style.overflow = "";
}

document.getElementById("backBtn").addEventListener("click", openList);
document.getElementById("imgClose").addEventListener("click", closeImageView);

imgOverlay.addEventListener("click", (e) => {
  if (e.target === imgOverlay) closeImageView();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && imgOverlay.classList.contains("show")) closeImageView();
});

complaintList.addEventListener("click", (e) => {
  if (e.target.closest("#clearFiltersBtn")) {
    clearComplaintFilters();
    return;
  }
  const row = e.target.closest("[data-id]");
  if (row) openDetail(row.dataset.id);
});

window.__adminRender = function (items) {
  complaintsLoaded = true;
  docs = items;
  if (currentId) {
    renderDetail();
  } else {
    renderList();
  }
};

window.__adminError = showError;

window.__chatsError = (message) => {
  const box = document.getElementById("chatsError");
  if (box) box.textContent = message || "";
};

startChatsWatch();
startPresenceWatch();

setInterval(() => {
  if (!chatThreads.length) return;
  const sig = chatThreads.map((t) => t.id + (isUserOnline(t.id) ? "1" : "0")).join(",");
  if (sig !== statusSig) {
    refreshChatViews();
  }
}, 10000);
