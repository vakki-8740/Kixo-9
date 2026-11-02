import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

function reportChatError(error, fallback) {
  if (typeof window.__chatPageError === "function") {
    window.__chatPageError(
      fallback + ": " + (error && error.message ? error.message : String(error || "Unknown error"))
    );
  }
}

try {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const settingsRef = doc(db, "settings", "app");

  window.__chatPage = {
    async ensureThread(chatId, profile) {
      const data = profile || {};
      const ref = doc(db, "chats", chatId);
      const snap = await getDoc(ref);
      const now = Date.now();
      const fields = {
        userName: data.userName || "Guest",
        mobile: data.mobile || "",
        visitorId: data.visitorId || "",
        updatedAt: now,
      };

      if (data.password) fields.password = data.password;
      if (data.reopen) fields.status = "open";

      if (!snap.exists()) {
        fields.status = "open";
        fields.createdAt = now;
        fields.lastAt = now;
        fields.lastMessage = "Chat started";
      }

      await setDoc(ref, fields, { merge: true });
      return { id: chatId, ...(snap.exists() ? snap.data() : {}), ...fields };
    },

    watchThread(chatId, onThread) {
      return onSnapshot(
        doc(db, "chats", chatId),
        (snap) => onThread(snap.exists() ? { id: snap.id, ...snap.data() } : null),
        (err) => {
          reportChatError(err, "Could not load chat");
          onThread(null);
        }
      );
    },

    watchMessages(chatId, onItems) {
      return onSnapshot(
        collection(db, "chats", chatId, "messages"),
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          onItems(items);
        },
        (err) => {
          reportChatError(err, "Could not load messages");
          onItems([]);
        }
      );
    },

    async sendMessage(chatId, data, profile) {
      const ref = await addDoc(collection(db, "chats", chatId, "messages"), data);
      const preview =
        data.type === "text" ? data.text : data.type === "image" ? "Image" : data.fileName || "File";
      const p = profile || {};
      const fields = {
        lastMessage: String(preview || "").slice(0, 120),
        lastAt: data.createdAt,
        updatedAt: Date.now(),
        status: "open",
      };

      if (p.userName) fields.userName = p.userName;
      if (p.mobile) fields.mobile = p.mobile;
      if (p.visitorId) fields.visitorId = p.visitorId;

      await setDoc(doc(db, "chats", chatId), fields, { merge: true });
      return ref.id;
    },

    deleteMessage(chatId, messageId) {
      return deleteDoc(doc(db, "chats", chatId, "messages", messageId));
    },

    setThreadStatus(chatId, status) {
      return setDoc(
        doc(db, "chats", chatId),
        { status, updatedAt: Date.now() },
        { merge: true }
      );
    },

    watchAdminPresence(onPresence) {
      return onSnapshot(
        doc(db, "presence", "admin"),
        (snap) => {
          const data = snap.exists() ? snap.data() : {};
          onPresence(Number(data.lastSeen || 0));
        },
        () => onPresence(0)
      );
    },

    beatPresence(chatId) {
      return setDoc(
        doc(db, "presence", chatId),
        { online: true, lastSeen: Date.now() },
        { merge: true }
      );
    },

    watchSettings(onSettings) {
      return onSnapshot(
        settingsRef,
        (snap) => onSettings(snap.exists() ? snap.data() : {}),
        () => onSettings({})
      );
    },

    async sendTelegram(token, chatId, text) {
      const res = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
        method: "POST",
        body: new URLSearchParams({ chat_id: chatId, text }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        console.warn("Chat Telegram alert failed:", (data && data.description) || res.status);
        return false;
      }
      return true;
    },
  };
} catch (err) {
  reportChatError(err, "Firebase connection failed");
}
