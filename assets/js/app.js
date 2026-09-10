/* ==========================================================================
   The Pearl Series — منطق الواجهة الرئيسية
   ========================================================================== */

import { BRAND } from "../../firebase/firebase-config.js";
import {
  login, loginWithGoogle, watchAuth, logout, authErrorAr, normalizeEmail
} from "../../firebase/auth.js";
import {
  fetchMember, checkIsAdmin, evaluateMember, hasAccess,
  fetchCatalog, fetchSectionTree
} from "../../firebase/access-control.js";
import { GROUPS } from "./catalog.js";

const $ = (s) => document.querySelector(s);
const waLink = (txt) =>
  `https://wa.me/${BRAND.whatsapp}?text=${encodeURIComponent(txt || "السلام عليكم، أريد الاشتراك في منصة The Pearl Series")}`;

/* ---------- المظهر (ليلي/نهاري) ---------- */
const THEME_KEY = "pearl.theme";
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const b = $("#theme-btn");
  if (b) b.textContent = t === "dark" ? "☀️" : "🌙";
  try { localStorage.setItem(THEME_KEY, t); } catch {}
}
(function initTheme() {
  let t = null;
  try { t = localStorage.getItem(THEME_KEY); } catch {}
  if (!t) t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  applyTheme(t);
})();

/* ---------- تبديل الشاشات ---------- */
const VIEWS = ["view-loading", "view-auth", "view-denied", "view-app"];
function show(id) { VIEWS.forEach(v => { const el = document.getElementById(v); if (el) el.hidden = (v !== id); }); }

function setMsg(el, text, kind = "info") {
  el.className = "msg msg-" + kind;
  el.innerHTML = text;
  el.hidden = false;
}

/* ========================= 1) تسجيل الدخول ========================= */
const loginForm = $("#login-form");
const loginMsg  = $("#login-msg");
const loginBtn  = $("#login-btn");

/* الدخول بحساب Google (الطريقة الأساسية) */
const googleBtn = $("#google-btn");
googleBtn.addEventListener("click", async () => {
  const original = googleBtn.innerHTML;
  googleBtn.disabled = true;
  googleBtn.innerHTML = '<span class="spinner"></span> جارٍ فتح نافذة Google…';
  try {
    await loginWithGoogle();           // watchAuth يكمل الباقي
  } catch (err) {
    setMsg(loginMsg, authErrorAr(err), "err");
  } finally {
    googleBtn.disabled = false;
    googleBtn.innerHTML = original;
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = normalizeEmail($("#login-email").value);
  const pass  = $("#login-pass").value;
  if (!email || !email.includes("@")) {
    return setMsg(loginMsg, "من فضلك اكتب بريدًا إلكترونيًا صحيحًا.", "err");
  }
  if (!pass) return setMsg(loginMsg, "من فضلك اكتب كود الدخول.", "err");

  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span class="spinner"></span> جارٍ الدخول…';
  try {
    await login(email, pass);          // watchAuth يكمل الباقي
    $("#login-pass").value = "";
  } catch (err) {
    setMsg(loginMsg, authErrorAr(err), "err");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "دخول";
  }
});

/* ========================= 2) الحارس ========================= */
let CURRENT = { user: null, member: null, evalRes: null, isAdmin: false, catalog: [] };

watchAuth(async (user) => {
  if (!user) { show("view-auth"); return; }
  show("view-loading");

  const email = normalizeEmail(user.email);
  let member = null;
  try {
    member = await fetchMember(email);
  } catch (err) {
    // permission-denied يعني غالبًا أن القواعد ترفض — نعامله كغير مفعّل
    console.warn("member read failed:", err.code || err.message);
  }

  const evalRes = evaluateMember(member);
  CURRENT = { user, member, evalRes, isAdmin: await checkIsAdmin(email), catalog: [] };

  if (!evalRes.ok) return renderDenied(email, evalRes);

  CURRENT.catalog = await fetchCatalog();
  renderApp();
});

/* ========================= 3) شاشة الرفض ========================= */
function renderDenied(email, ev) {
  $("#denied-email").textContent = email;
  const extra = {
    unregistered: `هذا البريد غير مُسجَّل في المنصة. تأكد أنك تستخدم نفس البريد الذي أرسلته لنا عند الاشتراك،
                   أو تواصل معنا لتفعيل حسابك.`,
    expired:      `انتهت صلاحية اشتراكك. تواصل معنا لتجديد الاشتراك ويعود المحتوى فورًا.`,
    suspended:    `تم إيقاف هذا الحساب مؤقتًا. تواصل معنا لمعرفة السبب.`,
    inactive:     `الاشتراك غير نشط حاليًا. تواصل معنا للتفعيل.`
  }[ev.state] || ev.reason;

  $("#denied-msg").innerHTML = `<strong>${ev.reason}</strong><br>${extra}`;
  $("#denied-wa").href = waLink(`السلام عليكم أ/ ${BRAND.teacher}، بريدي ${email} ولا أستطيع الدخول للمنصة.`);
  show("view-denied");
}
$("#denied-logout").addEventListener("click", () => logout());
$("#logout-btn").addEventListener("click", () => logout());
$("#theme-btn").addEventListener("click", () =>
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

/* ========================= 4) بناء البطاقات ========================= */
function renderApp() {
  const { user, member, evalRes, isAdmin, catalog } = CURRENT;

  const name = (member && member.name) || (user.email || "").split("@")[0];
  $("#welcome").textContent = `أهلًا بك، ${name} 👋`;
  $("#welcome-sub").textContent = "اختر القسم الذي تريد الدخول إليه. الأقسام المقفولة غير مشمولة في اشتراكك.";
  $("#year").textContent = new Date().getFullYear();
  $("#admin-link").hidden = !isAdmin;

  const open = catalog.filter(s => hasAccess(evalRes, s.id));
  $("#stat-open").textContent = open.length;
  $("#stat-days").textContent = evalRes.daysLeft === null ? "∞" : evalRes.daysLeft;

  if (evalRes.daysLeft !== null && evalRes.daysLeft <= 7) {
    setMsg($("#expiry-warn"),
      `⏳ تنبيه: يتبقى على انتهاء اشتراكك <strong>${evalRes.daysLeft}</strong> يوم/أيام.
       <a href="${waLink("أريد تجديد اشتراكي في منصة The Pearl Series")}" target="_blank" rel="noopener">جدّد الآن</a>`,
      "warn");
  }

  const root = $("#sections-root");
  root.innerHTML = "";
  const groups = GROUPS.filter(g => catalog.some(s => s.group === g.id));

  for (const g of groups) {
    const head = document.createElement("div");
    head.className = "section-title";
    head.dataset.group = g.id;
    head.innerHTML = `<h3>${g.ar}</h3>`;
    root.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "grid";
    catalog.filter(s => s.group === g.id).forEach(s => grid.appendChild(makeTile(s, hasAccess(evalRes, s.id))));
    root.appendChild(grid);
  }
  show("view-app");
}

function makeTile(sec, unlocked) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "tile " + (unlocked ? "tile-unlocked" : "tile-locked");
  el.dataset.group = sec.group || "";
  el.innerHTML = `
    <span class="tile-status ${unlocked ? "badge-open" : "badge-lock"}">${unlocked ? "مفتوح" : "🔒 مقفول"}</span>
    <span class="tile-icon">${sec.icon || "★"}</span>
    <h4>${sec.ar || sec.id}</h4>
    <span class="tile-en">${sec.en || ""}</span>
    <span class="tile-cta">${unlocked ? "ادخل الآن ←" : "غير مشترك في هذا القسم"}</span>`;
  el.addEventListener("click", () => unlocked ? openSection(sec, el) : showLock(sec));
  return el;
}

/* فتح القسم: نطلب مسارات القسم من Firestore (محمية بالقواعد) */
async function openSection(sec, el) {
  const cta = el.querySelector(".tile-cta");
  const old = cta.textContent;
  cta.innerHTML = '<span class="spinner" style="width:14px;height:14px"></span> جارٍ الفتح…';
  try {
    const tree = await fetchSectionTree(sec.id);
    openBrowser(sec, tree);
  } catch (err) {
    if (err.message === "not-published") {
      showLock(sec, "هذا القسم قيد الرفع وسيتاح قريبًا بإذن الله.");
    } else {
      showLock(sec, "تعذّر فتح القسم. تأكد من اشتراكك أو تواصل معنا.");
    }
  } finally {
    cta.textContent = old;
  }
}

/* ---------- نافذة اختيار المسار داخل الصف ---------- */
const tracksModal = $("#tracks-modal");

/* تصفّح متدرّج: الصف ← تِرم ← مسار ← وحدة، كله في نفس النافذة */
let BROWSE = { sec: null, stack: [] };   // stack: [{title, kind, items}]

function openBrowser(sec, tree) {
  BROWSE = { sec, stack: [] };
  pushLevel("term", tree, "");
  tracksModal.hidden = false;
}

/* يتخطّى المستوى تلقائيًا إذا كان فيه عنصر واحد بلا اسم (المحتوى القديم) */
function pushLevel(kind, items, title) {
  const visible = items.filter(x => x.enabled !== false || kind === "unit");
  if (kind !== "unit" && visible.length === 1 && !visible[0].title) {
    const only = visible[0];
    return pushLevel(kind === "term" ? "track" : "unit",
                     kind === "term" ? only.tracks : only.units, title);
  }
  BROWSE.stack.push({ kind, items, title });
  renderLevel();
}

function renderLevel() {
  const sec  = BROWSE.sec;
  const lvl  = BROWSE.stack[BROWSE.stack.length - 1];
  const path = BROWSE.stack.map(l => l.title).filter(Boolean);

  $("#tracks-icon").textContent  = sec.icon || "★";
  $("#tracks-title").textContent = path.length ? path[path.length - 1] : (sec.ar || sec.id);

  const label = { term: "التِرم", track: "المسار", unit: "الوحدة" }[lvl.kind];
  const shown = lvl.items.filter(x => x.enabled !== false);
  const soon  = lvl.items.length - shown.length;
  $("#tracks-sub").textContent =
    [sec.ar, ...path].filter(Boolean).join(" › ") + ` — اختر ${label}` +
    (soon ? ` (${soon} قريبًا)` : "");

  $("#tracks-back").hidden = BROWSE.stack.length < 2;

  const body = $("#tracks-body");
  body.innerHTML = "";

  if (!lvl.items.length) {
    body.innerHTML = `<div class="empty">لا يوجد محتوى منشور هنا بعد.</div>`;
    return;
  }

  lvl.items.forEach((it, i) => {
    const open = it.enabled !== false;
    const item = document.createElement("button");
    item.type = "button";
    item.className = "track-item" + (open ? "" : " track-soon");
    item.disabled = !open;

    const count = lvl.kind === "term"
      ? (it.tracks || []).reduce((n, t) => n + (t.units || []).length, 0) + " وحدة"
      : lvl.kind === "track" ? (it.units || []).length + " وحدة" : "";

    item.innerHTML = `
      <span class="track-num">${lvl.kind === "unit" ? String(i + 1).padStart(2, "0") : i + 1}</span>
      <span class="track-text">
        <strong>${it.title || label + " " + (i + 1)}</strong>
        ${it.desc ? `<small>${it.desc}</small>` : (count ? `<small>${count}</small>` : "")}
      </span>
      <span class="track-go">${open ? (lvl.kind === "unit" ? "افتح" : "التالي") : "🔒 قريبًا"}</span>`;

    if (open) item.addEventListener("click", () => {
      if (lvl.kind === "unit") { tracksModal.hidden = true; openViewer(it, sec); }
      else pushLevel(lvl.kind === "term" ? "track" : "unit",
                     lvl.kind === "term" ? (it.tracks || []) : (it.units || []),
                     it.title);
    });
    body.appendChild(item);
  });
}

$("#tracks-back").addEventListener("click", () => {
  if (BROWSE.stack.length > 1) { BROWSE.stack.pop(); renderLevel(); }
});

/* ---------- العارض الداخلي: يفتح الدرس داخل المنصة ---------- */
const viewer      = $("#viewer");
const viewerFrame = $("#viewer-frame");
const viewerLoad  = $(".viewer-load");
let viewerOpen = false;

let viewerTimer = null;

/* روابط لا يمكن عرضها داخل إطار (github.com يمنع ذلك صراحةً) */
function embeddable(url) {
  return !/^https?:\/\/(www\.)?(github\.com|drive\.google\.com\/file)/i.test(url || "");
}

function viewerFallback(track, why) {
  clearTimeout(viewerTimer);
  viewerLoad.hidden = true;
  $("#viewer-fallback").hidden = false;
  $("#viewer-why").textContent = why;
  $("#viewer-open-new").href = track.url;
}

function openViewer(track, sec) {
  $("#viewer-title").textContent = track.title || sec.ar;
  $("#viewer-sub").textContent   = sec.ar || "";
  $("#viewer-fallback").hidden = true;
  viewerLoad.hidden = false;
  viewer.hidden = false;
  document.body.classList.add("viewing");
  viewerOpen = true;
  history.pushState({ pearlViewer: true }, "");   // زر الرجوع يغلق العارض

  if (!embeddable(track.url)) {
    viewerFrame.src = "about:blank";
    viewerFallback(track, "هذا الرابط يمنع عرضه داخل المنصة (صفحة مستودع GitHub). الحل: فعّل GitHub Pages لهذا المستودع واستخدم رابط الصفحة، أو ارفع الملف داخل مجلد sections.");
    return;
  }
  viewerFrame.src = track.url;
  clearTimeout(viewerTimer);
  viewerTimer = setTimeout(() => {
    if (!viewerLoad.hidden) viewerFallback(track, "تأخّر تحميل الدرس أو رفض الموقع عرضه داخل إطار.");
  }, 9000);
}

function closeViewer(fromPop) {
  if (!viewerOpen) return;
  viewerOpen = false;
  viewer.hidden = true;
  viewerFrame.src = "about:blank";      // يوقف أي صوت شغّال
  document.body.classList.remove("viewing");

  /* الرجوع خطوة واحدة: نعود لقائمة الوحدات نفسها لا للصفحة الرئيسية */
  if (BROWSE.stack.length) tracksModal.hidden = false;

  if (!fromPop && history.state && history.state.pearlViewer) history.back();
}

/* زر ☰ داخل ملف الدرس يطلب الرجوع لقائمة الوحدات */
window.addEventListener("message", (e) => {
  if (e.data && e.data.pearl === "back") closeViewer(false);
});

viewerFrame.addEventListener("load", () => { viewerLoad.hidden = true; clearTimeout(viewerTimer); });
$("#viewer-back").addEventListener("click", () => closeViewer(false));
$("#viewer-reload").addEventListener("click", () => {
  viewerLoad.hidden = false;
  viewerFrame.src = viewerFrame.src;
});
$("#viewer-full").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else viewer.requestFullscreen && viewer.requestFullscreen();
});
window.addEventListener("popstate", () => closeViewer(true));

$("#tracks-close").addEventListener("click", () => { BROWSE.stack = []; tracksModal.hidden = true; });
tracksModal.addEventListener("click", (e) => { if (e.target === tracksModal) tracksModal.hidden = true; });

/* ---------- نافذة القفل ---------- */
const lockModal = $("#lock-modal");
function showLock(sec, customText) {
  $("#lock-body").innerHTML = customText ||
    `قسم <strong>${sec.ar}</strong> غير مشمول في اشتراكك الحالي.<br>
     تواصل معنا لإضافته إلى حسابك ويُفتح لك خلال دقائق.`;
  $("#lock-wa").href = waLink(`السلام عليكم، أريد الاشتراك في قسم: ${sec.ar} (${sec.en || sec.id})`);
  lockModal.hidden = false;
}
$("#lock-close").addEventListener("click", () => lockModal.hidden = true);
lockModal.addEventListener("click", (e) => { if (e.target === lockModal) lockModal.hidden = true; });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    lockModal.hidden = true; tracksModal.hidden = true;
    if (viewerOpen) closeViewer(false);
  }
});

/* ========================= بدء التشغيل ========================= */
/* لا شيء يُنفَّذ عند التحميل: watchAuth يقرر أي شاشة تظهر. */
