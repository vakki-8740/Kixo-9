const PROFILE_KEY = "KixoChatProfile";
const COMPLAINTS_KEY = "sentComplaints";
const VISITOR_ID_KEY = "KixoVisitorId";
const DRAFT_PREFIX = "KixoChatDraft:";
const MAX_MESSAGE_LENGTH = 2000;
const MAX_LOCAL_FILE = 10 * 1024 * 1024;
const ADMIN_ONLINE_WINDOW = 75000;

const startView = document.getElementById("startView");
const chatRoomView = document.getElementById("chatRoomView");
const startForm = document.getElementById("startForm");
const startChatBtn = document.getElementById("startChatBtn");
const cancelProfileBtn = document.getElementById("cancelProfileBtn");
const chatUserName = document.getElementById("chatUserName");
const chatMobile = document.getElementById("chatMobile");
const chatPassword = document.getElementById("chatPassword");
const startError = document.getElementById("startError");
const chatError = document.getElementById("chatError");
const profileSummary = document.getElementById("profileSummary");
const closedBanner = document.getElementById("closedBanner");
const messagesEl = document.getElementById("chatMessages");
const scrollBottomBtn = document.getElementById("scrollBottomBtn");
const attachmentPreview = document.getElementById("attachmentPreview");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const imageBtn = document.getElementById("imageBtn");
const pdfBtn = document.getElementById("pdfBtn");
const imageInput = document.getElementById("imageInput");
const pdfInput = document.getElementById("pdfInput");
const charCount = document.getElementById("charCount");
const supportDot = document.getElementById("supportDot");
const supportStatusText = document.getElementById("supportStatusText");
const connectionBadge = document.getElementById("connectionBadge");
const imgOverlay = document.getElementById("imgOverlay");
const imgView = document.getElementById("imgView");
const toastEl = document.getElementById("toast");

let profile = loadProfile();
let chatId = profile && profile.chatId ? profile.chatId : "";
let thread = null;
let remoteMessages = [];
let localMessages = [];
let messagesLoaded = false;
let sessionReady = false;
let watchedChatId = "";
let threadUnsub = null;
let messagesUnsub = null;
let adminPresenceUnsub = null;
let settingsUnsub = null;
let presenceTimer = null;
let adminLastSeen = 0;
let settingsData = null;
let pendingAttachment = null;
let localSequence = 0;
let toastTimer = null;
let editingProfile = false;

function makeId(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return prefix + window.crypto.randomUUID();
  }
  return prefix + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function getVisitorId() {
  if (window.__KixoVisitorId) return window.__KixoVisitorId;

  try {
    let id = localStorage.getItem(VISITOR_ID_KEY);
    if (!id) {
      id = makeId("visitor-");
      localStorage.setItem(VISITOR_ID_KEY, id);
    }
    window.__KixoVisitorId = id;
    return id;
  } catch {
    window.__KixoVisitorId = window.__KixoVisitorId || makeId("visitor-");
    return window.__KixoVisitorId;
  }
}

function loadProfile() {
  try {
    const data = JSON.parse(localStorage.getItem(PROFILE_KEY));
    return data && data.chatId ? data : null;
  } catch {
    return null;
  }
}

function saveProfile() {
  if (!profile) return;
  try {
    const safeProfile = {
      chatId: profile.chatId,
      userName: profile.userName || "",
      mobile: profile.mobile || "",
      visitorId: profile.visitorId || "",
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(safeProfile));
  } catch {}
}

function latestComplaintProfile() {
  try {
    const items = JSON.parse(localStorage.getItem(COMPLAINTS_KEY));
    if (!Array.isArray(items) || !items.length) return null;
    return items[items.length - 1] || null;
  } catch {
    return null;
  }
}

function showToast(message, type) {
  toastEl.textContent = message;
  toastEl.className = "toast show " + (type === "err" ? "err" : "ok");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3000);
}

function setChatError(message) {
  const text = String(message || "");
  chatError.textContent = text;
  chatError.classList.toggle("show", !!text);
  if (text) {
    connectionBadge.textContent = "Error";
    connectionBadge.className = "connection-badge error";
  }
}

window.__chatPageError = function (message) {
  setChatError(message || "");
};

function setStartError(message) {
  startError.textContent = message || "";
  startError.classList.toggle("show", !!message);
}

function chatWhenReady(tries) {
  if (window.__chatPage) return Promise.resolve(window.__chatPage);
  const n = tries || 0;
  if (n > 60) return Promise.reject(new Error("Chat connection is not ready"));
  return new Promise((resolve) => setTimeout(resolve, 500)).then(() => chatWhenReady(n + 1));
}

function startSettingsWatch() {
  chatWhenReady()
    .then((api) => {
      if (settingsUnsub || typeof api.watchSettings !== "function") return;
      settingsUnsub = api.watchSettings((data) => {
        settingsData = data || {};
      });
    })
    .catch(() => {});
}

function isAdminOnline() {
  return !!adminLastSeen && Date.now() - adminLastSeen < ADMIN_ONLINE_WINDOW;
}

function updateSupportStatus() {
  const online = isAdminOnline();
  supportDot.classList.toggle("online", online);
  supportStatusText.textContent = online ? "Support is online" : "Support is offline";

  if (!chatError.textContent) {
    connectionBadge.textContent = sessionReady || watchedChatId ? "Connected" : "Connecting";
    connectionBadge.className =
      "connection-badge" + (sessionReady || watchedChatId ? " connected" : "");
  }
}

function threadClosed() {
  return !!thread && thread.status === "closed";
}

function updateComposerState() {
  const closed = threadClosed();
  const hasText = !!messageInput.value.trim();
  const hasAttachment = !!pendingAttachment;
  const canSendLocal = hasAttachment && !closed;
  const canSendText = sessionReady && hasText && !closed;

  messageInput.disabled = closed;
  imageBtn.disabled = closed;
  pdfBtn.disabled = closed;
  sendBtn.disabled = !(canSendLocal || canSendText);
  charCount.textContent = messageInput.value.length + " / " + MAX_MESSAGE_LENGTH;
}

function showStartView(editing) {
  editingProfile = !!editing;
  startView.hidden = false;
  chatRoomView.hidden = true;
  cancelProfileBtn.hidden = !profile;

  if (profile) {
    chatUserName.value = profile.userName || "";
    chatMobile.value = profile.mobile || "";
  } else {
    const complaint = latestComplaintProfile();
    if (complaint) {
      if (!chatUserName.value) chatUserName.value = complaint.username || "";
      if (!chatMobile.value) chatMobile.value = complaint.mobile || "";
    }
  }

  chatPassword.value = "";
  setStartError("");
}

function showChatRoom() {
  editingProfile = false;
  startView.hidden = true;
  chatRoomView.hidden = false;
  profileSummary.textContent = profile
    ? (profile.userName || "Guest") + (profile.mobile ? " · " + profile.mobile : "")
    : "Guest";
  loadDraft();
  updateComposerState();
  requestAnimationFrame(() => scrollToBottom(false));
}

function validateStartForm() {
  let valid = true;
  const fields = [chatUserName, chatMobile, chatPassword];

  fields.forEach((field) => {
    field.classList.remove("invalid");
    if (!field.value.trim()) {
      field.classList.add("invalid");
      valid = false;
    }
  });

  if (chatMobile.value && !/^\d{10}$/.test(chatMobile.value.trim())) {
    chatMobile.classList.add("invalid");
    valid = false;
    setStartError("Enter a valid 10 digit mobile number.");
    return false;
  }

  if (!valid) {
    setStartError("Please fill all required fields.");
    return false;
  }

  setStartError("");
  return true;
}

async function startChatSession(profileData, options) {
  const opts = options || {};
  profile = profileData;
  chatId = profile.chatId;
  saveProfile();
  showChatRoom();
  setChatError("");
  updateSupportStatus();

  const api = await chatWhenReady();
  const ensured = await api.ensureThread(chatId, {
    userName: profile.userName,
    mobile: profile.mobile,
    visitorId: profile.visitorId,
    password: opts.password || "",
    reopen: !!opts.reopen,
  });

  thread = ensured || thread;
  sessionReady = true;
  startWatches(api);
  startPresence(api);
  handleThreadUpdate(thread);
  updateSupportStatus();
  updateComposerState();
}

function startWatches(api) {
  if (watchedChatId === chatId) return;

  if (threadUnsub) {
    try { threadUnsub(); } catch {}
  }
  if (messagesUnsub) {
    try { messagesUnsub(); } catch {}
  }
  if (adminPresenceUnsub) {
    try { adminPresenceUnsub(); } catch {}
  }

  watchedChatId = chatId;
  messagesLoaded = false;
  remoteMessages = [];
  renderMessages({ scrollBottom: true });

  threadUnsub = api.watchThread(chatId, handleThreadUpdate);
  messagesUnsub = api.watchMessages(chatId, handleMessagesUpdate);
  adminPresenceUnsub = api.watchAdminPresence((lastSeen) => {
    adminLastSeen = Number(lastSeen || 0);
    updateSupportStatus();
  });
}

function startPresence(api) {
  const beat = () => {
    if (!chatId || document.visibilityState === "hidden") return;
    Promise.resolve(api.beatPresence(chatId)).catch(() => {});
  };

  beat();
  if (presenceTimer) clearInterval(presenceTimer);
  presenceTimer = setInterval(beat, 20000);
}

function handleThreadUpdate(nextThread) {
  if (!nextThread || nextThread.id !== chatId) return;
  thread = nextThread;

  if (thread.userName || thread.mobile) {
    profile = {
      ...(profile || {}),
      chatId,
      userName: thread.userName || (profile && profile.userName) || "Guest",
      mobile: thread.mobile || (profile && profile.mobile) || "",
      visitorId: thread.visitorId || (profile && profile.visitorId) || getVisitorId(),
    };
    saveProfile();
    profileSummary.textContent =
      (profile.userName || "Guest") + (profile.mobile ? " · " + profile.mobile : "");
  }

  closedBanner.hidden = !threadClosed();
  updateComposerState();
}

function handleMessagesUpdate(items) {
  const wasNearBottom = isNearBottom();
  const previousIds = new Set(remoteMessages.map((m) => m.id));
  remoteMessages = Array.isArray(items) ? items : [];
  messagesLoaded = true;

  const remoteClientIds = new Set(remoteMessages.map((m) => m.clientId).filter(Boolean));
  localMessages = localMessages.filter(
    (m) => m._localOnly || m._failed || !remoteClientIds.has(m.clientId)
  );

  const hasNewRemote = remoteMessages.some((m) => !previousIds.has(m.id));
  renderMessages({ scrollBottom: wasNearBottom || !previousIds.size });

  if (hasNewRemote && !wasNearBottom) {
    scrollBottomBtn.hidden = false;
  }
  updateSupportStatus();
}

function messageTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dateLabel(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}

function formatSize(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "";
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return Math.round(value / 1024) + " KB";
  return (value / (1024 * 1024)).toFixed(1) + " MB";
}

function safeAttachmentUrl(value) {
  const url = String(value || "");
  if (/^(data:|blob:|https:\/\/)/i.test(url)) return url;
  return "";
}

function appendLinkedText(container, text) {
  const lines = String(text || "").split("\n");
  const urlPattern = /(https?:\/\/[^\s]+)/gi;

  lines.forEach((line, lineIndex) => {
    if (lineIndex) container.appendChild(document.createElement("br"));
    const parts = line.split(urlPattern);
    parts.forEach((part) => {
      if (/^https?:\/\//i.test(part)) {
        const link = document.createElement("a");
        link.href = part;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = part;
        container.appendChild(link);
      } else if (part) {
        container.appendChild(document.createTextNode(part));
      }
    });
  });
}

function createAction(label, action, danger) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "message-action" + (danger ? " danger" : "");
  button.dataset.action = action;
  button.textContent = label;
  return button;
}

function buildMessage(message) {
  const mine = message.sender === "user";
  const row = document.createElement("div");
  row.className =
    "message-row" +
    (mine ? " mine" : "") +
    (message._failed ? " failed" : "") +
    (message._localOnly ? " local-only" : "");
  row.dataset.messageId = message.id || message.clientId || "";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (!mine) {
    const sender = document.createElement("div");
    sender.className = "sender-label";
    sender.textContent = "Support Team";
    bubble.appendChild(sender);
  }

  if (message.type === "image") {
    const imageUrl = safeAttachmentUrl(message.objectUrl || message.data);
    if (imageUrl) {
      const image = document.createElement("img");
      image.className = "message-image";
      image.src = imageUrl;
      image.alt = message.fileName || "Chat image";
      image.loading = "lazy";
      image.addEventListener("click", () => openImageView(imageUrl));
      bubble.appendChild(image);
    } else {
      const text = document.createElement("div");
      text.className = "message-text";
      text.textContent = "Image is not available.";
      bubble.appendChild(text);
    }

    if (message.text) {
      const caption = document.createElement("div");
      caption.className = "message-caption";
      appendLinkedText(caption, message.text);
      bubble.appendChild(caption);
    }
  } else if (message.type === "file") {
    const fileUrl = safeAttachmentUrl(message.objectUrl || message.data);
    const card = document.createElement("a");
    card.className = "file-card";
    card.href = fileUrl || "#";
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    if (message.fileName) card.download = message.fileName;

    const icon = document.createElement("div");
    icon.className = "file-icon";
    const fileExtension = String(message.fileName || "").split(".").pop();
    icon.textContent = String(message.fileType || fileExtension || "FILE")
      .slice(0, 4)
      .toUpperCase();

    const info = document.createElement("div");
    info.className = "file-info";
    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = message.fileName || "PDF file";
    const meta = document.createElement("div");
    meta.className = "file-meta";
    meta.textContent = [message.fileType || "PDF", formatSize(message.fileSize)]
      .filter(Boolean)
      .join(" · ");
    info.appendChild(name);
    info.appendChild(meta);
    card.appendChild(icon);
    card.appendChild(info);
    bubble.appendChild(card);

    if (message.text) {
      const caption = document.createElement("div");
      caption.className = "message-caption";
      appendLinkedText(caption, message.text);
      bubble.appendChild(caption);
    }
  } else {
    const text = document.createElement("div");
    text.className = "message-text";
    appendLinkedText(text, message.text || "");
    bubble.appendChild(text);
  }

  if (message._localOnly) {
    const note = document.createElement("div");
    note.className = "local-note";
    note.textContent = "Local preview only · Not sent to admin yet";
    bubble.appendChild(note);
  }

  const meta = document.createElement("div");
  meta.className = "message-meta";
  const time = document.createElement("span");
  time.textContent = messageTime(message.createdAt);
  meta.appendChild(time);

  if (mine && !message._localOnly) {
    const status = document.createElement("span");
    status.textContent = message._failed ? "Failed" : message._pending ? "Sending..." : "Sent ✓";
    meta.appendChild(status);
  }
  bubble.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "message-actions";

  if (message.type === "text" && message.text) {
    const copyButton = createAction("Copy", "copy", false);
    copyButton.addEventListener("click", () => copyMessageText(message.text));
    actions.appendChild(copyButton);
  }

  if (message._failed) {
    const retryButton = createAction("Retry", "retry", false);
    retryButton.addEventListener("click", () => retryMessage(message));
    actions.appendChild(retryButton);
  }

  if (mine) {
    const deleteButton = createAction("Delete", "delete", true);
    deleteButton.addEventListener("click", () => deleteOwnMessage(message));
    actions.appendChild(deleteButton);
  }

  bubble.appendChild(actions);
  row.appendChild(bubble);
  return row;
}

function allMessages() {
  return [...remoteMessages, ...localMessages].sort((a, b) => {
    const timeDiff = (a.createdAt || 0) - (b.createdAt || 0);
    if (timeDiff) return timeDiff;
    return (a._seq || 0) - (b._seq || 0);
  });
}

function renderMessages(options) {
  const opts = options || {};
  messagesEl.innerHTML = "";

  if (!messagesLoaded && !localMessages.length) {
    messagesEl.innerHTML = '<p class="loading">Loading messages...</p>';
    return;
  }

  const messages = allMessages();
  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<strong>No messages yet</strong>Send your first message to the support team.";
    messagesEl.appendChild(empty);
    return;
  }

  let lastDate = "";
  messages.forEach((message) => {
    const label = dateLabel(message.createdAt);
    if (label && label !== lastDate) {
      lastDate = label;
      const separator = document.createElement("div");
      separator.className = "date-separator";
      const span = document.createElement("span");
      span.textContent = label;
      separator.appendChild(span);
      messagesEl.appendChild(separator);
    }
    messagesEl.appendChild(buildMessage(message));
  });

  if (opts.scrollBottom) {
    scrollToBottom(false);
    scrollBottomBtn.hidden = true;
  }
}

function isNearBottom() {
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
}

function scrollToBottom(smooth) {
  requestAnimationFrame(() => {
    messagesEl.scrollTo({
      top: messagesEl.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  });
}

async function copyMessageText(text) {
  let copied = false;
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {}
  }

  if (!copied) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try { copied = document.execCommand("copy"); } catch {}
    area.remove();
  }

  showToast(copied ? "Message copied" : "Copy failed", copied ? "ok" : "err");
}

async function deleteOwnMessage(message) {
  if (!confirm("Delete this message?")) return;

  if (message._localOnly || message._pending || message._failed) {
    localMessages = localMessages.filter((m) => m !== message);
    if (message.objectUrl && window.URL && URL.revokeObjectURL) {
      try { URL.revokeObjectURL(message.objectUrl); } catch {}
    }
    renderMessages({ scrollBottom: false });
    return;
  }

  try {
    const api = await chatWhenReady();
    await api.deleteMessage(chatId, message.id);
    showToast("Message deleted", "ok");
  } catch (err) {
    showToast("Delete failed: " + (err && err.message ? err.message : err), "err");
  }
}

function cleanRemotePayload(message) {
  const payload = {
    sender: "user",
    type: "text",
    text: message.text || "",
    createdAt: message.createdAt || Date.now(),
    clientId: message.clientId,
    edited: false,
  };
  return payload;
}

async function deliverTextMessage(localMessage) {
  try {
    const api = await chatWhenReady();
    const payload = cleanRemotePayload(localMessage);
    await api.sendMessage(chatId, payload, profile);
    localMessage._pending = false;
    localMessage._failed = false;
    renderMessages({ scrollBottom: true });
    notifyChatTelegram(payload);
  } catch (err) {
    localMessage._pending = false;
    localMessage._failed = true;
    renderMessages({ scrollBottom: true });
    showToast("Message failed to send. Tap Retry.", "err");
  }
}

function retryMessage(message) {
  message._pending = true;
  message._failed = false;
  renderMessages({ scrollBottom: true });
  deliverTextMessage(message);
}

function notifyChatTelegram(payload) {
  if (!settingsData || !window.__chatPage || typeof window.__chatPage.sendTelegram !== "function") {
    return;
  }

  const token = String(settingsData.chatTgToken || "").trim();
  const telegramChatId = String(settingsData.chatTgChatId || "").trim();
  if (!token || !telegramChatId) return;

  const text = [
    "New chat message",
    "User: " + (profile && profile.userName ? profile.userName : "Guest"),
    "From: User",
    "Message: " + (payload.text || ""),
    "Time: " + new Date(payload.createdAt || Date.now()).toLocaleString(),
  ].join("\n");

  Promise.resolve(window.__chatPage.sendTelegram(token, telegramChatId, text)).catch(() => {});
}

function addLocalAttachmentMessage(caption) {
  if (!pendingAttachment) return;
  const now = Date.now();
  const localMessage = {
    id: makeId("local-"),
    clientId: makeId("local-"),
    sender: "user",
    type: pendingAttachment.kind,
    text: caption || "",
    objectUrl: pendingAttachment.url,
    fileName: pendingAttachment.file.name,
    fileSize: pendingAttachment.file.size,
    fileType: pendingAttachment.kind === "file" ? "PDF" : "Image",
    createdAt: now,
    _localOnly: true,
    _seq: ++localSequence,
  };


  localMessages.push(localMessage);
  pendingAttachment = null;
  renderAttachmentPreview();
  renderMessages({ scrollBottom: true });
}

async function sendCurrentMessage() {
  if (threadClosed()) {
    showToast("This chat is closed. Reopen it to send a message.", "err");
    return;
  }

  const text = messageInput.value.trim();

  if (pendingAttachment) {
    addLocalAttachmentMessage(text);
    messageInput.value = "";
    clearDraft();
    autoResizeInput();
    updateComposerState();
    showToast("File preview added on this device only.", "ok");
    return;
  }

  if (!text) return;
  if (!sessionReady) {
    showToast("Chat is still connecting. Please wait.", "err");
    return;
  }

  const clientId = makeId("msg-");
  const localMessage = {
    id: clientId,
    clientId,
    sender: "user",
    type: "text",
    text,
    createdAt: Date.now(),
    _pending: true,
    _failed: false,
    _seq: ++localSequence,
  };


  localMessages.push(localMessage);
  messageInput.value = "";
  clearDraft();
  autoResizeInput();
  updateComposerState();
  renderMessages({ scrollBottom: true });
  deliverTextMessage(localMessage);
}

function renderAttachmentPreview() {
  attachmentPreview.innerHTML = "";

  if (!pendingAttachment) {
    attachmentPreview.hidden = true;
    updateComposerState();
    return;
  }

  attachmentPreview.hidden = false;

  if (pendingAttachment.kind === "image") {
    const image = document.createElement("img");
    image.className = "attachment-thumb";
    image.src = pendingAttachment.url;
    image.alt = pendingAttachment.file.name;
    attachmentPreview.appendChild(image);
  } else {
    const icon = document.createElement("div");
    icon.className = "attachment-file-icon";
    icon.textContent = "PDF";
    attachmentPreview.appendChild(icon);
  }

  const copy = document.createElement("div");
  copy.className = "attachment-copy";

  const name = document.createElement("div");
  name.className = "attachment-name";
  name.textContent = pendingAttachment.file.name;

  const sub = document.createElement("div");
  sub.className = "attachment-sub";
  sub.textContent =
    (pendingAttachment.kind === "image" ? "Image" : "PDF") +
    " · " +
    formatSize(pendingAttachment.file.size);

  const note = document.createElement("div");
  note.className = "attachment-local-note";
  note.textContent = "Local preview only — this file will not be sent or stored yet.";

  copy.appendChild(name);
  copy.appendChild(sub);
  copy.appendChild(note);
  attachmentPreview.appendChild(copy);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "mini-close";
  remove.setAttribute("aria-label", "Remove selected file");
  remove.textContent = "×";
  remove.addEventListener("click", clearPendingAttachment);
  attachmentPreview.appendChild(remove);

  updateComposerState();
}

function clearPendingAttachment() {
  if (pendingAttachment && pendingAttachment.url && window.URL && URL.revokeObjectURL) {
    try { URL.revokeObjectURL(pendingAttachment.url); } catch {}
  }
  pendingAttachment = null;
  imageInput.value = "";
  pdfInput.value = "";
  renderAttachmentPreview();
}

function selectAttachment(file, expectedKind) {
  if (!file) return;

  const isImage = file.type && file.type.startsWith("image/");
  const isPdf =
    file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");

  if (expectedKind === "image" && !isImage) {
    showToast("Please choose an image file.", "err");
    return;
  }
  if (expectedKind === "file" && !isPdf) {
    showToast("Please choose a PDF file.", "err");
    return;
  }
  if (!isImage && !isPdf) {
    showToast("Only image and PDF files are supported.", "err");
    return;
  }
  if (file.size > MAX_LOCAL_FILE) {
    showToast("File is too large. Maximum local preview size is 10 MB.", "err");
    return;
  }

  clearPendingAttachment();

  let url = "";
  try {
    url = URL.createObjectURL(file);
  } catch {
    showToast("Could not preview this file.", "err");
    return;
  }

  pendingAttachment = {
    kind: isImage ? "image" : "file",
    file,
    url,
  };
  renderAttachmentPreview();
  messageInput.focus();
}

function autoResizeInput() {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
}

function draftKey() {
  return DRAFT_PREFIX + (chatId || "new");
}

function saveDraft() {
  try {
    localStorage.setItem(draftKey(), messageInput.value);
  } catch {}
}

function loadDraft() {
  try {
    messageInput.value = localStorage.getItem(draftKey()) || "";
  } catch {
    messageInput.value = "";
  }
  autoResizeInput();
  updateComposerState();
}

function clearDraft() {
  try {
    localStorage.removeItem(draftKey());
  } catch {}
}

function openImageView(src) {
  const safeSrc = safeAttachmentUrl(src);
  if (!safeSrc) return;
  imgView.src = safeSrc;
  imgOverlay.classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeImageView() {
  imgOverlay.classList.remove("show");
  imgView.removeAttribute("src");
  document.body.style.overflow = "";
}

/* ---------- Menu ---------- */
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
  if (!imgOverlay.classList.contains("show")) document.body.style.overflow = "";
}

menuBtn.addEventListener("click", openMenu);
document.getElementById("menuClose").addEventListener("click", closeMenu);
menuOverlay.addEventListener("click", (e) => {
  if (e.target === menuOverlay) closeMenu();
});

/* ---------- Events ---------- */
[chatUserName, chatMobile, chatPassword].forEach((field) => {
  field.addEventListener("input", () => {
    field.classList.remove("invalid");
    setStartError("");
  });
});

startForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateStartForm()) return;

  startChatBtn.disabled = true;
  startChatBtn.querySelector("span").textContent = "Starting...";

  const visitorId = getVisitorId();
  const nextProfile = {
    chatId: chatId || visitorId,
    userName: chatUserName.value.trim(),
    mobile: chatMobile.value.trim(),
    visitorId,
  };

  try {
    await startChatSession(nextProfile, {
      password: chatPassword.value,
      reopen: true,
    });
    showToast("Chat started", "ok");
    messageInput.focus();
  } catch (err) {
    profile = nextProfile;
    chatId = nextProfile.chatId;
    saveProfile();
    showChatRoom();
    setChatError("Could not start chat: " + (err && err.message ? err.message : err));
  } finally {
    startChatBtn.disabled = false;
    startChatBtn.querySelector("span").textContent = "Start Chat";
  }
});

cancelProfileBtn.addEventListener("click", () => {
  if (profile) showChatRoom();
});

document.getElementById("changeProfileBtn").addEventListener("click", () => {
  showStartView(true);
});

document.getElementById("reopenChatBtn").addEventListener("click", async () => {
  try {
    const api = await chatWhenReady();
    await api.setThreadStatus(chatId, "open");
    if (thread) thread.status = "open";
    closedBanner.hidden = true;
    updateComposerState();
    showToast("Chat reopened", "ok");
  } catch (err) {
    showToast("Reopen failed: " + (err && err.message ? err.message : err), "err");
  }
});

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendCurrentMessage();
});

messageInput.addEventListener("input", () => {
  autoResizeInput();
  saveDraft();
  updateComposerState();
});

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendCurrentMessage();
  }
});

messageInput.addEventListener("paste", (e) => {
  const files = e.clipboardData && e.clipboardData.files;
  if (files && files.length) {
    const file = files[0];
    if (file.type && file.type.startsWith("image/")) {
      e.preventDefault();
      selectAttachment(file, "image");
    }
  }
});

imageBtn.addEventListener("click", () => imageInput.click());
pdfBtn.addEventListener("click", () => pdfInput.click());

imageInput.addEventListener("change", () => {
  selectAttachment(imageInput.files[0], "image");
  imageInput.value = "";
});

pdfInput.addEventListener("change", () => {
  selectAttachment(pdfInput.files[0], "file");
  pdfInput.value = "";
});

chatRoomView.addEventListener("dragover", (e) => {
  e.preventDefault();
});

chatRoomView.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) selectAttachment(file, file.type && file.type.startsWith("image/") ? "image" : "file");
});

messagesEl.addEventListener("scroll", () => {
  if (isNearBottom()) scrollBottomBtn.hidden = true;
});

scrollBottomBtn.addEventListener("click", () => {
  scrollBottomBtn.hidden = true;
  scrollToBottom(true);
});

document.getElementById("imgClose").addEventListener("click", closeImageView);
imgOverlay.addEventListener("click", (e) => {
  if (e.target === imgOverlay) closeImageView();
});

document.getElementById("homeBtn").addEventListener("click", () => {
  window.location.href = "../index.html";
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  closeMenu();
  if (imgOverlay.classList.contains("show")) closeImageView();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && window.__chatPage && chatId) {
    Promise.resolve(window.__chatPage.beatPresence(chatId)).catch(() => {});
  }
});

window.addEventListener("beforeunload", () => {
  localMessages.forEach((message) => {
    if (message.objectUrl && window.URL && URL.revokeObjectURL) {
      try { URL.revokeObjectURL(message.objectUrl); } catch {}
    }
  });
  if (pendingAttachment && pendingAttachment.url && window.URL && URL.revokeObjectURL) {
    try { URL.revokeObjectURL(pendingAttachment.url); } catch {}
  }
});

setInterval(updateSupportStatus, 10000);
startSettingsWatch();

if (profile && chatId) {
  profile.visitorId = profile.visitorId || getVisitorId();
  showChatRoom();
  startChatSession(profile, { reopen: false }).catch((err) => {
    setChatError("Could not connect chat: " + (err && err.message ? err.message : err));
  });
} else {
  showStartView(false);
}

updateSupportStatus();
updateComposerState();
