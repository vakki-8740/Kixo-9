import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

try {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const col = collection(db, "complaints");
  const settingsRef = doc(db, "settings", "app");

  onSnapshot(
    col,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      window.__adminError("");
      window.__adminRender(items);
    },
    (err) => {
      window.__adminRender([]);
      window.__adminError(
        "Could not load complaints: " + (err && err.message ? err.message : err)
      );
    }
  );

  window.__adminDelete = (id) => {
    if (!confirm("Delete this complaint permanently?")) return false;
    deleteDoc(doc(db, "complaints", id)).catch((err) =>
      window.__adminError("Delete failed: " + err.message)
    );
    return true;
  };

  window.__adminStatus = (id, status) =>
    updateDoc(doc(db, "complaints", id), { status })
      .then(() => true)
      .catch((err) => {
        window.__adminError("Status update failed: " + err.message);
        return false;
      });

  window.__saveSettings = (data) => setDoc(settingsRef, data, { merge: true });

  onSnapshot(
    settingsRef,
    (snap) => window.__adminSettings(snap.exists() ? snap.data() : {}),
    () => {}
  );

  window.__visitorAdmin = {
    watchVisitors(onItems) {
      return onSnapshot(
        collection(db, "visitors"),
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          items.sort(
            (a, b) =>
              (b.lastSeenAt || b.firstSeenAt || 0) - (a.lastSeenAt || a.firstSeenAt || 0)
          );
          window.__visitorsError("");
          onItems(items);
        },
        (err) => {
          window.__visitorsError(
            "Could not load visitors: " + (err && err.message ? err.message : err)
          );
          onItems([]);
        }
      );
    },
  };

  const presenceRef = doc(db, "presence", "admin");
  const beatPresence = () =>
    setDoc(presenceRef, { online: true, lastSeen: Date.now() }, { merge: true }).catch(() => {});

  beatPresence();
  setInterval(beatPresence, 20000);

  window.__chatAdmin = {
    watchChats(onItems) {
      return onSnapshot(
        collection(db, "chats"),
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          items.sort((a, b) => (b.lastAt || b.createdAt || 0) - (a.lastAt || a.createdAt || 0));
          onItems(items);
        },
        (err) => {
          window.__chatsError("Could not load chats: " + (err && err.message ? err.message : err));
          onItems([]);
        }
      );
    },

    watchThread(id, onThread) {
      return onSnapshot(
        doc(db, "chats", id),
        (snap) => onThread(snap.exists() ? { id: snap.id, ...snap.data() } : null),
        () => onThread(null)
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
        () => onItems([])
      );
    },

    async sendMessage(chatId, data) {
      const ref = await addDoc(collection(db, "chats", chatId, "messages"), data);
      const preview =
        data.type === "text" ? data.text : data.type === "image" ? "Image" : data.fileName || "File";

      const fields = {
        lastMessage: preview.slice(0, 120),
        lastAt: data.createdAt,
        updatedAt: Date.now(),
      };

      if (data.userName) fields.userName = data.userName;

      await setDoc(doc(db, "chats", chatId), fields, { merge: true });
      return ref.id;
    },

    deleteMessage(chatId, id) {
      return deleteDoc(doc(db, "chats", chatId, "messages", id));
    },

    watchPresence(onMap) {
      return onSnapshot(
        collection(db, "presence"),
        (snap) => {
          const map = {};
          snap.docs.forEach((d) => {
            const data = d.data() || {};
            map[d.id] = data.lastSeen || 0;
          });
          onMap(map);
        },
        () => onMap({})
      );
    },
  };

  startChatsWatch();
  startVisitorsWatch();
} catch (err) {
  window.__adminRender([]);
  window.__adminError("Firebase init failed: " + (err && err.message ? err.message : err));
}
