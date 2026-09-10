window.__ModuleLoader__.load({id:"dsh-notifications",factory:(require)=>{var module={exports:{}};var exports=module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.jsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = __toESM(require("react"), 1);

// src/tracker.js
function createTracker({ row, isChild, pending, emit }) {
  const running = /* @__PURE__ */ new Map();
  const questions = /* @__PURE__ */ new Map();
  const project = (entry) => entry.cwd?.split(/[\\/]/).filter(Boolean).at(-1) || entry.displayTitle;
  const main = (id) => {
    const entry = row(id);
    return entry && entry.origin !== "subagent" && !isChild(id) ? entry : void 0;
  };
  return {
    baseline(rows) {
      const ids = new Set(rows.map((entry) => entry.id));
      for (const id of running.keys()) if (!ids.has(id)) running.delete(id);
      for (const entry of rows) {
        if (!running.has(entry.id)) running.set(entry.id, entry.running);
      }
    },
    status(id, active) {
      const previous = running.get(id);
      running.set(id, active);
      const entry = main(id);
      if (entry && previous === true && !active && !pending().has(id)) {
        emit({ kind: "complete", sessionId: id, title: project(entry) });
      }
    },
    attention() {
      const current = pending();
      for (const id of questions.keys()) if (!current.has(id)) questions.delete(id);
      for (const [id, request] of current) {
        const entry = main(id);
        if (!entry || questions.get(id) === request.key) continue;
        questions.set(id, request.key);
        const question = request.questions?.[0]?.question;
        emit({
          kind: "attention",
          reason: request.kind,
          sessionId: id,
          title: project(entry),
          ...question ? { question } : {}
        });
      }
    },
    reset() {
      running.clear();
    },
    remove(id) {
      running.delete(id);
      questions.delete(id);
    }
  };
}

// src/browser.js
var KEY = "dsh-notifications.preferences.v1";
var DEFAULTS = { enabled: false, sound: true, dismissed: false };
function createBrowser({ win, t, open }) {
  let prefs = read();
  let audio;
  let disposed = false;
  let leader = !win.navigator.locks;
  let releaseLeader;
  const abort = new AbortController();
  const listeners = /* @__PURE__ */ new Set();
  const notifications = /* @__PURE__ */ new Set();
  let snapshot;
  let error = "";
  let delivery = "";
  let latestNotification;
  function read() {
    try {
      const stored = JSON.parse(win.localStorage.getItem(KEY));
      return Object.fromEntries(Object.entries(DEFAULTS).map(([key, value]) => [key, typeof stored?.[key] === "boolean" ? stored[key] : value]));
    } catch {
      return { ...DEFAULTS };
    }
  }
  function permission() {
    return win.isSecureContext && win.Notification ? win.Notification.permission : "unsupported";
  }
  function publish() {
    if (disposed) return;
    snapshot = { ...prefs, permission: permission(), audioReady: audio?.state === "running", error, delivery };
    for (const listener of listeners) listener();
  }
  function save(patch) {
    prefs = { ...prefs, ...patch };
    try {
      win.localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
    }
    publish();
  }
  function report(key, cause) {
    if (disposed) return;
    error = key;
    console.warn("[dsh-notifications]", key, cause);
    publish();
  }
  function unlock() {
    if (disposed || !prefs.sound) return Promise.resolve();
    try {
      const Audio = win.AudioContext || win.webkitAudioContext;
      if (!Audio) return Promise.resolve();
      audio ??= new Audio();
      audio.onstatechange = publish;
      return audio.resume().then(publish).catch((cause) => report("soundFailed", cause));
    } catch (cause) {
      report("soundFailed", cause);
      return Promise.resolve();
    }
  }
  function chime() {
    if (!prefs.sound || audio?.state !== "running") return;
    for (const [offset, frequency] of [[0, 659.25], [0.17, 880]]) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + offset;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.13, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(1e-3, start + 0.32);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + 0.35);
    }
  }
  function notify(event, test2 = false) {
    if (disposed || !prefs.enabled || permission() !== "granted" || !test2 && !leader) return;
    const title = test2 ? t("testTitle") : event.title || t("projectFallback");
    const detail = test2 ? t("testBody") : event.kind === "complete" ? t("finished") : event.question || t(["question", "approval", "plan-review"].includes(event.reason) ? event.reason : "generic");
    const compact = detail.replace(/\s+/g, " ").trim();
    const characters = Array.from(compact);
    const body = characters.length > 180 ? `${characters.slice(0, 179).join("")}\u2026` : compact;
    delivery = "deliveryPending";
    latestNotification = void 0;
    publish();
    try {
      const notification = new win.Notification(title, {
        body,
        // Each occurrence gets a new banner rather than silently replacing a
        // previous notification. The tracker already deduplicates live events.
        silent: true,
        requireInteraction: test2 || event.kind === "attention"
      });
      latestNotification = notification;
      notifications.add(notification);
      notification.onshow = () => {
        if (disposed || latestNotification !== notification) return;
        delivery = "deliveryShown";
        publish();
      };
      notification.onerror = () => {
        notifications.delete(notification);
        if (disposed || latestNotification !== notification) return;
        delivery = "deliveryFailed";
        report("failed", "The desktop notification emitted an error event.");
      };
      notification.onclose = () => notifications.delete(notification);
      notification.onclick = () => {
        notification.close();
        if (disposed) return;
        win.focus();
        if (event.sessionId) open(event.sessionId);
      };
    } catch (cause) {
      delivery = "deliveryFailed";
      report("failed", cause);
    }
    try {
      chime();
    } catch (cause) {
      report("soundFailed", cause);
    }
  }
  async function enable() {
    error = "";
    if (permission() === "unsupported") {
      publish();
      return;
    }
    const soundReady = unlock();
    let allowed;
    try {
      allowed = await win.Notification.requestPermission();
    } catch (cause) {
      report("failed", cause);
      return;
    }
    if (disposed) return;
    save({ enabled: allowed === "granted", dismissed: allowed === "granted" });
    await soundReady;
    if (!disposed && allowed === "granted") notify({}, true);
  }
  async function test() {
    error = "";
    await unlock();
    notify({}, true);
    publish();
  }
  const gesture = () => {
    if (prefs.enabled) void unlock();
  };
  const storage = (event) => {
    if (event.key === KEY || event.key === null) {
      prefs = read();
      publish();
    }
  };
  win.addEventListener("pointerdown", gesture);
  win.addEventListener("keydown", gesture);
  win.addEventListener("storage", storage);
  win.addEventListener("focus", publish);
  if (win.navigator.locks) {
    void win.navigator.locks.request("dsh-notifications.sender.v1", { signal: abort.signal }, async () => {
      if (disposed) return;
      leader = true;
      await new Promise((resolve) => {
        releaseLeader = resolve;
      });
      leader = false;
    }).catch((cause) => {
      if (!disposed) report("failed", cause);
    });
  }
  publish();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    enable,
    test,
    notify,
    dismiss: () => save({ dismissed: true }),
    disable: () => save({ enabled: false, dismissed: true }),
    sound(value) {
      save({ sound: value });
      if (value) void unlock();
    },
    dispose() {
      disposed = true;
      abort.abort();
      releaseLeader?.();
      win.removeEventListener("pointerdown", gesture);
      win.removeEventListener("keydown", gesture);
      win.removeEventListener("storage", storage);
      win.removeEventListener("focus", publish);
      for (const notification of notifications) notification.close();
      notifications.clear();
      listeners.clear();
      if (audio) {
        audio.onstatechange = null;
        void audio.close().catch(() => {
        });
      }
    }
  };
}

// src/locales.js
var en = {
  title: "Notifications",
  description: "Get a desktop alert and chime when a main thread stops or needs your attention.",
  enable: "Enable notifications",
  later: "Not now",
  disable: "Disable notifications",
  test: "Test notification & chime",
  sound: "Play a sound",
  projectFallback: "Project",
  question: "Question",
  approval: "Approval needed",
  "plan-review": "Review plan",
  generic: "Response needed",
  finished: "Finished",
  testTitle: "Notification test",
  testBody: "Notifications enabled",
  granted: "Notifications enabled for this browser.",
  off: "Notifications are off.",
  denied: "Notifications are blocked. Allow them in this site\u2019s browser settings, then try again.",
  unsupported: "Desktop notifications need a supported browser on localhost or HTTPS.",
  default: "Click Enable notifications, then choose Allow in your browser.",
  failed: "The browser could not show a notification. Check this site\u2019s notification settings.",
  deliveryPending: "Desktop notification requested; display is not confirmed. If you only hear sound, check your browser\u2019s notifications in your operating system settings and turn off Do Not Disturb.",
  deliveryShown: "The browser reported the notification shown. If no banner appeared, check your desktop notification center and enable banners for your browser.",
  deliveryFailed: "Desktop notification failed. Sound can still play independently.",
  audio: "Click Test notification & chime to enable sound in this tab.",
  soundFailed: "Sound is unavailable. Check this site\u2019s sound and autoplay settings.",
  note: "Keep DSH open in a tab. Preferences apply to this browser and address. Subagent threads are silent."
};
var zh = {
  title: "\u901A\u77E5",
  description: "\u4E3B\u7EBF\u7A0B\u505C\u6B62\u6216\u9700\u8981\u60A8\u5904\u7406\u65F6\uFF0C\u63A5\u6536\u684C\u9762\u901A\u77E5\u548C\u63D0\u793A\u97F3\u3002",
  enable: "\u542F\u7528\u901A\u77E5",
  later: "\u6682\u4E0D\u542F\u7528",
  disable: "\u5173\u95ED\u901A\u77E5",
  test: "\u6D4B\u8BD5\u901A\u77E5\u548C\u63D0\u793A\u97F3",
  sound: "\u64AD\u653E\u63D0\u793A\u97F3",
  projectFallback: "\u9879\u76EE",
  question: "\u5F85\u56DE\u7B54\u7684\u95EE\u9898",
  approval: "\u9700\u8981\u6279\u51C6",
  "plan-review": "\u5BA1\u6838\u8BA1\u5212",
  generic: "\u9700\u8981\u56DE\u590D",
  finished: "\u5DF2\u5B8C\u6210",
  testTitle: "\u6D4B\u8BD5\u901A\u77E5",
  testBody: "\u901A\u77E5\u5DF2\u542F\u7528",
  granted: "\u6B64\u6D4F\u89C8\u5668\u5DF2\u542F\u7528\u901A\u77E5\u3002",
  off: "\u901A\u77E5\u5DF2\u5173\u95ED\u3002",
  denied: "\u901A\u77E5\u5DF2\u88AB\u963B\u6B62\u3002\u8BF7\u5728\u6D4F\u89C8\u5668\u7684\u7F51\u7AD9\u8BBE\u7F6E\u4E2D\u5141\u8BB8\u901A\u77E5\uFF0C\u7136\u540E\u91CD\u8BD5\u3002",
  unsupported: "\u684C\u9762\u901A\u77E5\u9700\u8981\u652F\u6301\u7684\u6D4F\u89C8\u5668\uFF0C\u5E76\u4F7F\u7528 localhost \u6216 HTTPS\u3002",
  default: "\u70B9\u51FB\u542F\u7528\u901A\u77E5\uFF0C\u7136\u540E\u5728\u6D4F\u89C8\u5668\u4E2D\u9009\u62E9\u5141\u8BB8\u3002",
  failed: "\u6D4F\u89C8\u5668\u65E0\u6CD5\u663E\u793A\u901A\u77E5\u3002\u8BF7\u68C0\u67E5\u6B64\u7F51\u7AD9\u7684\u901A\u77E5\u8BBE\u7F6E\u3002",
  deliveryPending: "\u5DF2\u8BF7\u6C42\u684C\u9762\u901A\u77E5\uFF0C\u5C1A\u672A\u786E\u8BA4\u663E\u793A\u3002\u5982\u679C\u53EA\u542C\u5230\u58F0\u97F3\uFF0C\u8BF7\u68C0\u67E5\u64CD\u4F5C\u7CFB\u7EDF\u4E2D\u6D4F\u89C8\u5668\u7684\u901A\u77E5\u8BBE\u7F6E\u5E76\u5173\u95ED\u52FF\u6270\u6A21\u5F0F\u3002",
  deliveryShown: "\u6D4F\u89C8\u5668\u62A5\u544A\u901A\u77E5\u5DF2\u663E\u793A\u3002\u5982\u679C\u6CA1\u6709\u6A2A\u5E45\uFF0C\u8BF7\u68C0\u67E5\u684C\u9762\u901A\u77E5\u4E2D\u5FC3\u5E76\u4E3A\u6D4F\u89C8\u5668\u542F\u7528\u6A2A\u5E45\u3002",
  deliveryFailed: "\u684C\u9762\u901A\u77E5\u5931\u8D25\u3002\u63D0\u793A\u97F3\u4ECD\u53EF\u72EC\u7ACB\u64AD\u653E\u3002",
  audio: "\u70B9\u51FB\u6D4B\u8BD5\u901A\u77E5\u548C\u63D0\u793A\u97F3\uFF0C\u4E3A\u6B64\u6807\u7B7E\u9875\u542F\u7528\u58F0\u97F3\u3002",
  soundFailed: "\u65E0\u6CD5\u64AD\u653E\u58F0\u97F3\u3002\u8BF7\u68C0\u67E5\u6B64\u7F51\u7AD9\u7684\u58F0\u97F3\u548C\u81EA\u52A8\u64AD\u653E\u8BBE\u7F6E\u3002",
  note: "\u8BF7\u4FDD\u6301 DSH \u6807\u7B7E\u9875\u6253\u5F00\u3002\u8BBE\u7F6E\u4EC5\u9002\u7528\u4E8E\u6B64\u6D4F\u89C8\u5668\u548C\u5730\u5740\u3002\u5B50\u4EE3\u7406\u7EBF\u7A0B\u4E0D\u53D1\u9001\u901A\u77E5\u3002"
};

// src/client.jsx
var NS = "dsh-notifications";
var card = {
  boxSizing: "border-box",
  padding: 18,
  borderRadius: 12,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  color: "var(--dsw-alias-label-primary, #202124)",
  background: "var(--dsw-alias-bg-layer-2, #fff)",
  border: "1px solid var(--dsw-alias-border-l1, #d0d7de)",
  fontSize: 14
};
var button = {
  borderRadius: 8,
  border: "1px solid var(--dsw-alias-border-l1, #d0d7de)",
  padding: "8px 12px",
  background: "transparent",
  color: "inherit",
  cursor: "pointer"
};
function Controls({ browser, t, prompt = false }) {
  const state = import_react.default.useSyncExternalStore(browser.subscribe, browser.getSnapshot);
  const [busy, setBusy] = import_react.default.useState(false);
  if (prompt && (state.dismissed || state.enabled || state.permission === "unsupported")) return null;
  const status = state.error || (state.permission === "granted" ? state.enabled ? "granted" : "off" : state.permission);
  return /* @__PURE__ */ import_react.default.createElement("section", { "aria-label": t("title"), style: prompt ? {
    ...card,
    position: "fixed",
    bottom: 24,
    right: 24,
    width: 380,
    maxWidth: "calc(100vw - 48px)",
    zIndex: 1e3,
    boxShadow: "0 8px 32px #0003"
  } : card }, /* @__PURE__ */ import_react.default.createElement("strong", { style: { fontSize: 16 } }, t("title")), /* @__PURE__ */ import_react.default.createElement("div", null, t("description")), /* @__PURE__ */ import_react.default.createElement("div", { role: "status", style: { fontSize: 12 } }, t(status)), /* @__PURE__ */ import_react.default.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 } }, !state.enabled || state.permission !== "granted" ? /* @__PURE__ */ import_react.default.createElement("button", { style: button, disabled: busy || state.permission === "unsupported", onClick: async () => {
    setBusy(true);
    try {
      await browser.enable();
    } finally {
      setBusy(false);
    }
  } }, t("enable")) : /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("button", { style: button, onClick: () => void browser.test() }, t("test")), /* @__PURE__ */ import_react.default.createElement("button", { style: button, onClick: browser.disable }, t("disable"))), prompt && /* @__PURE__ */ import_react.default.createElement("button", { style: button, onClick: browser.dismiss }, t("later"))), !prompt && /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("label", { style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ import_react.default.createElement("input", { type: "checkbox", checked: state.sound, onChange: (event) => browser.sound(event.target.checked) }), t("sound")), state.enabled && state.sound && !state.audioReady && /* @__PURE__ */ import_react.default.createElement("div", { style: { fontSize: 12 } }, t("audio")), state.enabled && state.delivery && /* @__PURE__ */ import_react.default.createElement("div", { role: "status", style: { fontSize: 12 } }, t(state.delivery)), /* @__PURE__ */ import_react.default.createElement("div", { style: { fontSize: 12, opacity: 0.75 } }, t("note"))));
}
var inject = ["sessions", "uiSession", "remote", "slots", "locale", "layout"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }));
  const t = ctx.locale.bind(NS);
  ctx.effect(() => {
    const browser = createBrowser({ win: window, t, open: (id) => {
      if (!ctx.sessions.list.getSnapshot().byId[id]) return;
      ctx.sessions.open(id);
      ctx.layout.selectPanel(null);
    } });
    const list = ctx.sessions.list;
    const pending = ctx.uiSession.pendingInteractions;
    const tracker = createTracker({
      row: (id) => list.getSnapshot().byId[id],
      isChild: (id) => Boolean(ctx.sessions.subagentAddress(id)),
      pending: () => pending.getSnapshot(),
      emit: (event) => browser.notify(event)
    });
    const baseline = () => {
      const state = list.getSnapshot();
      if (state.phase === "ready") tracker.baseline(Object.values(state.byId));
      tracker.attention();
    };
    const disposers = [
      list.subscribe(baseline),
      pending.subscribe(() => tracker.attention()),
      ctx.remote.$on("api-session/status", (id, active) => tracker.status(id, active)),
      ctx.remote.$on("api-session/removed", (id) => tracker.remove(id)),
      ctx.on("connection/reset", () => tracker.reset()),
      ctx.slots.inject("shell.overlay", () => ctx.slots.register({
        name: "shell.overlay",
        id: NS,
        order: 90,
        locale: NS,
        inject: () => ({ browser, prompt: true })
      }, Controls)),
      ctx.slots.inject("settings.general.item", () => ctx.slots.register({
        name: "settings.general.item",
        id: NS,
        order: 90,
        locale: NS,
        inject: () => ({ browser })
      }, Controls))
    ];
    baseline();
    return () => {
      for (const dispose of disposers.reverse()) dispose();
      browser.dispose();
    };
  });
}
return module.exports;}});
