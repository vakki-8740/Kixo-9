const complaintList = document.getElementById("complaintList");
const STORAGE_KEY = "sentComplaints";

const PAGE_PREFIX = "../";

const toastEl = document.getElementById("toast");
let toastTimer = null;

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3200);
}

let settingsData = null;

function applySettings(data) {
  settingsData = data || {};
}

function startSettingsWatch(tries) {
  const n = tries || 0;

  if (typeof window.__watchSettings === "function") {
    window.__watchSettings(applySettings);
    return;
  }

  if (n < 60) setTimeout(() => startSettingsWatch(n + 1), 500);
}

function openLiveChat() {
  if (!settingsData) {
    showToast("Please wait a moment and try again.");
    return;
  }

  const url = String(settingsData.chatUrl || "").trim();

  if (!url || /^(javascript|data|vbscript):/i.test(url)) {
    showToast("Live chat is not available right now. Please send a complaint.");
    return;
  }

  // Admin panel me set kiye gaye Live Chat link par redirect karo.
  let target = url;
  if (!/^https?:\/\//i.test(target) && !target.startsWith("/") && !target.startsWith("../")) {
    target = PAGE_PREFIX + target;
  }
  window.location.href = target;
}

// Menu: button header ke right side me hai, menu left side se khulta hai.
const menuBtn = document.getElementById("menuBtn");
const menuOverlay = document.getElementById("menuOverlay");

function openMenu() {
  menuOverlay.classList.add("show");
  menuBtn.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
}

function closeMenu() {
  menuOverlay.classList.remove("show");
  menuBtn.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
}

menuBtn.addEventListener("click", openMenu);
document.getElementById("menuClose").addEventListener("click", closeMenu);

menuOverlay.addEventListener("click", (e) => {
  if (e.target === menuOverlay) closeMenu();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});

document.querySelectorAll("[data-live-chat]").forEach((btn) => {
  btn.addEventListener("click", openLiveChat);
});

startSettingsWatch();

function getComplaints() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[ch];
  });
}

let mailboxItems = [];

function renderMailbox() {
  const items = getComplaints();
  mailboxItems = items;
  complaintList.innerHTML = "";

  if (!items.length) {
    complaintList.innerHTML = '<p class="empty">No complaints sent yet.</p>';
    return;
  }

  items
    .map((c, index) => ({ c, index }))
    .reverse()
    .forEach(({ c, index }) => {
      const successful = c.status === "Successful";
      const statusClass = successful ? "successful" : "pending";
      const statusText = successful ? "Successful" : "Pending";

      const viewBtn = c.image
        ? `<div class="complaint-actions">
             <button type="button" class="view-btn" data-view="${index}">
               <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
               View
             </button>
           </div>`
        : "";

      const writtenProblem = String(c.writtenProblem || "").trim();
      const detailRow = writtenProblem
        ? `<div class="complaint-row full"><span class="lbl">Written Problem</span><span class="val">${esc(writtenProblem)}</span></div>`
        : c.amount || c.problem !== "Account Problem"
          ? `<div class="complaint-row"><span class="lbl">Amount</span><span class="val">${c.amount ? "&#8377;" + esc(c.amount) : "-"}</span></div>`
          : "";

      const row = document.createElement("div");
      row.className = "complaint-item";
      row.innerHTML = `
        <div class="complaint-top">
          <div>
            <div class="complaint-name">${esc(c.username)}</div>
            <div class="complaint-time">${esc(c.date)}</div>
          </div>
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="complaint-details">
          <div class="complaint-row"><span class="lbl">Mobile Number</span><span class="val">${esc(c.mobile)}</span></div>
          <div class="complaint-row"><span class="lbl">Email ID</span><span class="val">${esc(c.email)}</span></div>
          <div class="complaint-row"><span class="lbl">Problem</span><span class="val">${esc(c.problem)}</span></div>
          ${detailRow}
        </div>
        ${viewBtn}
      `;
      complaintList.appendChild(row);
    });
}

document.getElementById("backBtn").addEventListener("click", () => {
  window.location.href = "../index.html";
});

// Image viewer
const imgOverlay = document.getElementById("imgOverlay");
const imgView = document.getElementById("imgView");

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

document.getElementById("imgClose").addEventListener("click", closeImageView);

imgOverlay.addEventListener("click", (e) => {
  if (e.target === imgOverlay) closeImageView();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && imgOverlay.classList.contains("show")) closeImageView();
});

complaintList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-view]");
  if (!btn) return;
  const item = mailboxItems[Number(btn.dataset.view)];
  if (item && item.image) openImageView(item.image);
});

// Admin status change kare to yaha live update ho.
const watchedIds = {};
let watchTries = 0;

function persistItems(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

function watchItem(item) {
  if (!item || !item.cloudId || watchedIds[item.cloudId]) return;
  if (typeof window.__watchStatus !== "function") return;

  watchedIds[item.cloudId] = true;
  const cloudId = item.cloudId;

  window.__watchStatus(cloudId, (status) => {
    if (!status) return;
    const items = getComplaints();
    const live = items.find((c) => c.cloudId === cloudId);
    if (!live || live.status === status) return;

    live.status = status;
    persistItems(items);
    renderMailbox();
    showToast("Complaint status updated: " + status);
  });
}

function syncWatch() {
  getComplaints().forEach(watchItem);

  if (typeof window.__watchStatus !== "function" && watchTries++ < 60) {
    setTimeout(syncWatch, 500);
  }
}

renderMailbox();
syncWatch();
