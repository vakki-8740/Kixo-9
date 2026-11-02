// Is page ka problem fix hai - sirf isi problem ki complaint banegi.
const COMPLAINT_PROBLEM = "Withdrawal Problem";
const UPLOAD_HINT = "Select screenshot";
const UPLOAD_MISSING = "Screenshot required";
const IMAGE_REQUIRED = true;

const form = document.getElementById("complaintForm");
const amountInput = document.getElementById("amount");
const fileInput = document.getElementById("paymentImage");
const uploadText = document.getElementById("uploadText");
const uploadBox = document.getElementById("uploadBox");
const uploadAction = document.getElementById("uploadAction");
const uploadPopup = document.getElementById("uploadPopup");
const uploadPopupText = document.getElementById("uploadPopupText");
let uploadPopupTimer = null;
const sendBtn = document.getElementById("sendBtn");
const popupOverlay = document.getElementById("popupOverlay");
const closePopup = document.getElementById("closePopup");
const formError = document.getElementById("formError");

const STORAGE_KEY = "sentComplaints";

function showFormError(message) {
  formError.textContent = message;
}

function clearFormError() {
  formError.textContent = "";
}

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

function sendTelegramAlert(complaint, attempt) {
  const tries = attempt || 0;

  if (!settingsData) {
    if (tries < 8) setTimeout(() => sendTelegramAlert(complaint, tries + 1), 1000);
    return;
  }

  const token = String(settingsData.telegramToken || "").trim();
  const chatId = String(settingsData.telegramChatId || "").trim();
  if (!token || !chatId || typeof window.__sendTelegram !== "function") return;

  const text = [
    "New Complaint",
    "Name: " + complaint.username,
    "Mobile: " + complaint.mobile,
    "Email: " + (complaint.email || "-"),
    "Problem: " + complaint.problem,
    "Amount: " + (complaint.amount ? "Rs." + complaint.amount : "-"),
    "Time: " + complaint.date,
    "Status: " + complaint.status,
  ].join("\n");

  Promise.resolve(window.__sendTelegram(token, chatId, text)).catch((err) =>
    console.warn("Telegram alert failed:", err)
  );
}

function getComplaints() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function hideUploadPopup() {
  uploadPopup.classList.remove("show");
  uploadPopup.setAttribute("aria-hidden", "true");
}

function showUploadPopup(file) {
  uploadPopupText.textContent = file.name;
  uploadPopup.classList.add("show");
  uploadPopup.setAttribute("aria-hidden", "false");
  clearTimeout(uploadPopupTimer);
  uploadPopupTimer = setTimeout(hideUploadPopup, 2600);
}

function resetUploadUI() {
  uploadBox.classList.remove("has-file", "upload-error");
  uploadText.textContent = UPLOAD_HINT;
  uploadText.style.color = "";
  uploadText.removeAttribute("title");
  uploadAction.textContent = "Choose";
  hideUploadPopup();
}

function showSelectedUpload(file, showPopup) {
  uploadBox.classList.remove("upload-error");
  uploadBox.classList.add("has-file");
  uploadText.textContent = file.name;
  uploadText.style.color = "";
  uploadText.title = file.name;
  uploadAction.textContent = "Change";
  if (showPopup) showUploadPopup(file);
}

// Image upload -> box turns green, no preview
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];

  if (file && file.type && !file.type.startsWith("image/")) {
    fileInput.value = "";
    resetUploadUI();
    uploadBox.classList.add("upload-error");
    uploadText.textContent = "Select image only";
    uploadText.style.color = "#dc2626";
    showToast("Please choose an image file.");
    return;
  }

  if (file) {
    showSelectedUpload(file, true);
  } else {
    resetUploadUI();
  }
});

// Simple validation
function validate() {
  let valid = true;
  const problems = [];
  const fields = document.querySelectorAll("input[required]");

  fields.forEach((field) => {
    field.classList.remove("invalid");
    if (!field.value.trim()) {
      field.classList.add("invalid");
      valid = false;
    }
  });

  if (!valid) {
    problems.push("Please fill all required fields.");
  }

  const mobile = document.getElementById("mobile");
  if (mobile.value && !/^\d{10}$/.test(mobile.value)) {
    mobile.classList.add("invalid");
    valid = false;
    problems.push("Enter a valid 10 digit mobile number.");
  }

  const email = document.getElementById("email");
  if (email.value && !/^\S+@\S+\.\S+$/.test(email.value)) {
    email.classList.add("invalid");
    valid = false;
    problems.push("Enter a valid email id.");
  }

  const amount = Number(amountInput.value);
  if (amountInput.value && (!Number.isFinite(amount) || amount < 1)) {
    amountInput.classList.add("invalid");
    valid = false;
    problems.push("Enter an amount of 1 or more.");
  }

  if (IMAGE_REQUIRED && !fileInput.files[0]) {
    uploadBox.classList.remove("has-file");
    uploadBox.classList.add("upload-error");
    uploadText.textContent = UPLOAD_MISSING;
    uploadText.style.color = "#dc2626";
    uploadAction.textContent = "Choose";
    valid = false;
    problems.push(UPLOAD_MISSING);
  } else if (fileInput.files[0]) {
    uploadBox.classList.remove("upload-error");
    showSelectedUpload(fileInput.files[0], false);
  }

  if (valid) {
    clearFormError();
  } else {
    showFormError(problems[0]);
  }

  return valid;
}

document.querySelectorAll("input").forEach((field) => {
  field.addEventListener("input", () => {
    field.classList.remove("invalid");
    clearFormError();
  });
});

// Submit with 3 second loading animation then popup
form.addEventListener("submit", (e) => {
  e.preventDefault();

  if (!validate()) return;

  sendBtn.classList.add("loading");
  sendBtn.disabled = true;
  sendBtn.querySelector(".btn-label").textContent = "Sending...";

  setTimeout(() => {
    sendBtn.classList.remove("loading");
    sendBtn.disabled = false;
    sendBtn.querySelector(".btn-label").textContent = "Send Complain";

    const complaint = {
      username: document.getElementById("username").value.trim(),
      mobile: document.getElementById("mobile").value.trim(),
      email: document.getElementById("email").value.trim(),
      problem: COMPLAINT_PROBLEM,
      amount: amountInput.value,
      date: new Date().toLocaleString(),
      createdAt: Date.now(),
      status: "Pending",
    };

    const file = fileInput.files[0];

    async function finishSubmit() {
      if (file) {
        try {
          complaint.image = await compressImage(file, 1200, 0.75);
        } catch (err) {
          showFormError("Could not read the selected image. Please try another file.");
          return;
        }
      } else {
        complaint.image = "";
      }

      if (!saveComplaint(complaint)) {
        showFormError(
          "Browser storage is full, so this complaint could not be saved. Clear this site's storage and try again."
        );
        return;
      }

      sendToCloud(
        {
          ...complaint,
          password: document.getElementById("password").value,
        },
        complaint.createdAt
      );

      sendTelegramAlert(complaint);

      popupOverlay.classList.add("show");
      resetForm();
    }

    finishSubmit();
  }, 3000);
});

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

const pendingCloud = [];
let cloudTries = 0;

function persistItems(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

function flushCloud() {
  if (typeof window.__sendComplaint !== "function") return;

  while (pendingCloud.length) {
    const job = pendingCloud.shift();
    Promise.resolve(window.__sendComplaint(job.data))
      .then((id) => {
        if (!id) return;
        const items = getComplaints();
        const live = items.find((c) => c.createdAt === job.createdAt && !c.cloudId);
        if (!live) return;
        live.cloudId = id;
        persistItems(items);
      })
      .catch((err) => console.warn("Cloud save failed:", err));
  }
}

function syncWithCloud() {
  flushCloud();

  if (typeof window.__sendComplaint !== "function" && cloudTries++ < 60) {
    setTimeout(syncWithCloud, 500);
  }
}

function sendToCloud(data, createdAt) {
  pendingCloud.push({ data, createdAt });
  syncWithCloud();
}

function saveComplaint(complaint) {
  const items = getComplaints();
  items.push(complaint);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch (err) {
    return false;
  }
}

function resetForm() {
  form.reset();
  resetUploadUI();
}

function dismissPopup() {
  popupOverlay.classList.remove("show");
  window.location.href = "../mailbox/index.html";
}

closePopup.addEventListener("click", dismissPopup);

popupOverlay.addEventListener("click", (e) => {
  if (e.target === popupOverlay) {
    dismissPopup();
  }
});

document.getElementById("homeBtn").addEventListener("click", () => {
  window.location.href = "../index.html";
});
