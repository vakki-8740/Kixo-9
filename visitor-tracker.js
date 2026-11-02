import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const VISITOR_ID_KEY = "KixoVisitorId";
const VISITOR_SESSION_KEY = "KixoVisitorSessionCounted";

function makeVisitorId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return (
    "visitor-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

function getVisitorId() {
  try {
    let id = localStorage.getItem(VISITOR_ID_KEY);
    if (!id) {
      id = makeVisitorId();
      localStorage.setItem(VISITOR_ID_KEY, id);
    }
    return id;
  } catch {
    return window.__KixoVisitorId || makeVisitorId();
  }
}

function currentPageName() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("/deposit/")) return "Deposit Problem";
  if (path.includes("/withdrawal/")) return "Withdrawal Problem";
  if (path.includes("/account/")) return "Account Problem";
  if (path.includes("/mailbox/")) return "All Complaints";
  if (path.includes("/chat-page/")) return "Live Chat";
  if (path.includes("/terms/")) return "Terms & Conditions";
  if (path.includes("/about/")) return "About Page";
  return "Home Page";
}

function visitorDeviceInfo() {
  const ua = navigator.userAgent || "";
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);

  let browser = "Unknown";
  if (/Edg\//i.test(ua)) browser = "Microsoft Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";

  let platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  if (!platform) {
    if (/Android/i.test(ua)) platform = "Android";
    else if (/iPhone|iPad|iPod/i.test(ua)) platform = "iOS";
    else if (/Win/i.test(ua)) platform = "Windows";
    else if (/Mac/i.test(ua)) platform = "macOS";
    else if (/Linux/i.test(ua)) platform = "Linux";
    else platform = "Unknown";
  }

  return {
    deviceType: isMobile ? "Mobile" : "Desktop",
    browser,
    platform,
    language: navigator.language || "",
    screenSize: `${window.screen.width} x ${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    userAgent: ua,
  };
}

async function trackVisitor() {
  const visitorId = getVisitorId();
  window.__KixoVisitorId = visitorId;

  const app = initializeApp(firebaseConfig, "visitorTracker");
  const db = getFirestore(app);
  const visitorRef = doc(db, "visitors", visitorId);
  const now = Date.now();
  const page = currentPageName();

  let isNewSession = false;
  try {
    isNewSession = !sessionStorage.getItem(VISITOR_SESSION_KEY);
    if (isNewSession) sessionStorage.setItem(VISITOR_SESSION_KEY, "1");
  } catch {
    isNewSession = true;
  }

  const existing = await getDoc(visitorRef);
  const data = {
    visitorId,
    lastSeenAt: now,
    lastPage: page,
    lastPagePath: window.location.pathname,
    pageViews: increment(1),
    visits: increment(isNewSession ? 1 : 0),
    referrer: document.referrer || "Direct",
    ...visitorDeviceInfo(),
  };

  if (!existing.exists()) {
    data.firstSeenAt = now;
    data.firstPage = page;
  }

  await setDoc(visitorRef, data, { merge: true });

  window.setInterval(() => {
    if (document.visibilityState === "hidden") return;
    setDoc(
      visitorRef,
      {
        lastSeenAt: Date.now(),
        lastPage: currentPageName(),
        lastPagePath: window.location.pathname,
      },
      { merge: true }
    ).catch(() => {});
  }, 30000);
}

trackVisitor().catch(() => {
  // Visitor tracking should never block the user panel.
});
