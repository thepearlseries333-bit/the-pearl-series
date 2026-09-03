/* ==========================================================================
   The Pearl Series — لوحة إدارة الاشتراكات
   --------------------------------------------------------------------------
   هذه الصفحة لا تحمي نفسها بكلمة مرور في الكود (وهذا مقصود!).
   الحماية أن قواعد Firestore ترفض أي كتابة إلا إذا كان بريدك موجودًا في
   مجموعة admins. لذلك حتى لو فتح شخص هذه الصفحة، لن يستطيع تعديل أي شيء.
   ========================================================================== */

import { db } from "../firebase/firebase-config.js";
import { watchAuth, logout, normalizeEmail } from "../firebase/auth.js";
import { checkIsAdmin, toDate, fetchCatalog } from "../firebase/access-control.js";
import {
  collection, getDocs, doc, setDoc, deleteDoc, getDoc,
  serverTimestamp, Timestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $  = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* ---------- المظهر ---------- */
const THEME_KEY = "pearl.theme";
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $("#theme-btn").textContent = t === "dark" ? "☀️" : "🌙";
  try { localStorage.setItem(THEME_KEY, t); } catch {}
}
applyTheme((() => { try { return localStorage.getItem(THEME_KEY) || "light"; } catch { return "light"; } })());
$("#theme-btn").addEventListener("click", () =>
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

function setMsg(el, html, kind = "info") { el.className = "msg msg-" + kind; el.innerHTML = html; el.hidden = false; }
function hide(el) { el.hidden = true; }

let CATALOG = [];
let MEMBERS = [];

/* ========================= الحارس ========================= */
watchAuth(async (user) => {
  if (!user) {
    $("#admin-loading").hidden = true;
    $("#admin-denied").hidden = false;
    setMsg($("#admin-denied-msg"), "سجّل الدخول أولًا من الصفحة الرئيسية بالبريد المُعرَّف كأدمن.", "err");
    return;
  }
  const email = normalizeEmail(user.email);
  const ok = await checkIsAdmin(email);
  $("#admin-loading").hidden = true;
  if (!ok) {
    $("#admin-denied").hidden = false;
    setMsg($("#admin-denied-msg"),
      `البريد <span class="mono" dir="ltr">${email}</span> ليس مشرفًا.<br>
       أضِفه في Firestore داخل مجموعة <span class="mono">admins</span> بمعرّف مستند = البريد نفسه.`, "err");
    return;
  }
  $("#admin-who").textContent = email;
  $("#admin-app").hidden = false;
  CATALOG = await fetchCatalog();
  buildSectionChips();
  await loadMembers();
});

$("#admin-logout").addEventListener("click", () => logout().then(() => location.href = "../index.html"));
$("#admin-logout2").addEventListener("click", () => logout().then(() => location.href = "../index.html"));

/* ========================= جدول المشتركين ========================= */
async function loadMembers() {
  const snap = await getDocs(collection(db, "members"));
  MEMBERS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  MEMBERS.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, "ar"));
  renderStats();
  renderRows();
}

function stateOf(m) {
  const exp = toDate(m.expiresAt);
  if (m.status === "suspended") return "suspended";
  if (exp && exp < new Date()) return "expired";
  return m.status === "active" ? "active" : "suspended";
}
function daysLeft(m) {
  const exp = toDate(m.expiresAt);
  return exp ? Math.ceil((exp - new Date()) / 86400000) : null;
}

function renderStats() {
  $("#s-total").textContent   = MEMBERS.length;
  $("#s-active").textContent  = MEMBERS.filter(m => stateOf(m) === "active").length;
  $("#s-expired").textContent = MEMBERS.filter(m => stateOf(m) === "expired").length;
  $("#s-soon").textContent    = MEMBERS.filter(m => { const d = daysLeft(m); return d !== null && d >= 0 && d <= 7; }).length;
}

function renderRows() {
  const q = $("#search").value.trim().toLowerCase();
  const fs = $("#filter-status").value;
  const list = MEMBERS.filter(m => {
    const hay = `${m.id} ${m.name || ""} ${m.phone || ""}`.toLowerCase();
    return (!q || hay.includes(q)) && (!fs || stateOf(m) === fs);
  });

  const labels = { active:"نشط", expired:"منتهٍ", suspended:"موقوف" };
  const tbody = $("#rows");
  tbody.innerHTML = list.map(m => {
    const st = stateOf(m);
    const secs = Array.isArray(m.sections) ? m.sections : [];
    const secTxt = secs.includes("*") ? "كل الأقسام"
      : secs.map(id => (CATALOG.find(c => c.id === id) || {}).ar || id).join("، ") || "—";
    const exp = toDate(m.expiresAt);
    const d = daysLeft(m);
    return `<tr>
      <td class="mono" dir="ltr">${m.id}</td>
      <td>${m.name || "—"}</td>
      <td class="mono" dir="ltr">${m.phone || "—"}</td>
      <td><span class="pill pill-${st}">${labels[st]}</span></td>
      <td style="max-width:240px">${secTxt}</td>
      <td>${exp ? exp.toLocaleDateString("ar-EG") + (d !== null && d >= 0 ? ` <small>(${d} يوم)</small>` : "") : "دائم"}</td>
      <td>
        <button class="btn btn-ghost btn-sm" data-edit="${m.id}">تعديل</button>
        <button class="btn btn-ghost btn-sm" data-renew="${m.id}">+سنة</button>
        <button class="btn btn-danger btn-sm" data-del="${m.id}">حذف</button>
      </td></tr>`;
  }).join("");

  $("#empty").hidden = list.length > 0;
  $$("[data-edit]").forEach(b => b.onclick = () => openMember(b.dataset.edit));
  $$("[data-del]").forEach(b  => b.onclick = () => removeMember(b.dataset.del));
  $$("[data-renew]").forEach(b => b.onclick = () => renewMember(b.dataset.renew, 365));
}

$("#search").addEventListener("input", renderRows);
$("#filter-status").addEventListener("change", renderRows);
$("#btn-refresh").addEventListener("click", () => loadMembers());

/* ========================= مودال المشترك ========================= */
const mModal = $("#member-modal");
let EDITING = null;

function buildSectionChips() {
  $("#f-sections").innerHTML = CATALOG.map(s => `
    <label class="chip" data-id="${s.id}">
      <input type="checkbox" value="${s.id}">
      <span>${s.ar}</span>
    </label>`).join("");
  $$("#f-sections .chip").forEach(chip => {
    const box = chip.querySelector("input");
    chip.addEventListener("click", (e) => {
      e.preventDefault();
      box.checked = !box.checked;
      chip.classList.toggle("on", box.checked);
    });
  });
}
function setChips(ids) {
  const all = ids.includes("*");
  $$("#f-sections .chip").forEach(chip => {
    const on = all || ids.includes(chip.dataset.id);
    chip.classList.toggle("on", on);
    chip.querySelector("input").checked = on;
  });
}
function getChips() {
  return $$("#f-sections .chip input").filter(i => i.checked).map(i => i.value);
}

$("#pick-all").onclick  = () => setChips(["*"]);
$("#pick-none").onclick = () => setChips([]);
$$("[data-add-days]").forEach(b => b.onclick = () => {
  const base = $("#f-expires").value ? new Date($("#f-expires").value) : new Date();
  base.setDate(base.getDate() + Number(b.dataset.addDays));
  $("#f-expires").value = base.toISOString().slice(0, 10);
});

function openMember(id) {
  EDITING = id || null;
  hide($("#form-msg"));
  $("#member-modal-title").textContent = id ? "تعديل مشترك" : "إضافة مشترك";
  $("#f-email").disabled = !!id;

  const m = id ? MEMBERS.find(x => x.id === id) : null;
  $("#f-email").value  = m ? m.id : "";
  $("#f-name").value   = (m && m.name)  || "";
  $("#f-phone").value  = (m && m.phone) || "";
  $("#f-notes").value  = (m && m.notes) || "";
  $("#f-status").value = (m && m.status === "suspended") ? "suspended" : "active";
  const exp = m ? toDate(m.expiresAt) : null;
  $("#f-expires").value = exp ? exp.toISOString().slice(0, 10) : "";
  setChips(m && Array.isArray(m.sections) ? m.sections : []);
  mModal.hidden = false;
  if (!id) $("#f-email").focus();
}

$("#btn-add").onclick      = () => openMember(null);
$("#member-cancel").onclick = () => mModal.hidden = true;
mModal.addEventListener("click", e => { if (e.target === mModal) mModal.hidden = true; });

$("#member-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = normalizeEmail($("#f-email").value);
  if (!email.includes("@")) return setMsg($("#form-msg"), "بريد إلكتروني غير صحيح.", "err");

  const secs = getChips();
  const allOn = secs.length === CATALOG.length && CATALOG.length > 0;
  if (!secs.length) return setMsg($("#form-msg"), "اختر قسمًا واحدًا على الأقل.", "err");

  const expVal = $("#f-expires").value;
  const payload = {
    name:   $("#f-name").value.trim(),
    phone:  $("#f-phone").value.trim(),
    notes:  $("#f-notes").value.trim(),
    status: $("#f-status").value,
    sections: allOn ? ["*"] : secs,
    expiresAt: expVal ? Timestamp.fromDate(new Date(expVal + "T23:59:59")) : null,
    updatedAt: serverTimestamp()
  };
  if (!EDITING) payload.createdAt = serverTimestamp();

  const btn = $("#member-save");
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> حفظ…';
  try {
    if (!EDITING) {
      const exists = await getDoc(doc(db, "members", email));
      if (exists.exists()) throw new Error("duplicate");
    }
    await setDoc(doc(db, "members", email), payload, { merge: true });
    mModal.hidden = true;
    await loadMembers();
    setMsg($("#admin-msg"), `✅ تم حفظ <span class="mono" dir="ltr">${email}</span>.`, "ok");
    setTimeout(() => hide($("#admin-msg")), 4000);
  } catch (err) {
    setMsg($("#form-msg"),
      err.message === "duplicate" ? "هذا البريد مضاف بالفعل — استخدم «تعديل»."
      : err.code === "permission-denied" ? "لا تملك صلاحية الكتابة. تأكد أن بريدك في مجموعة admins."
      : "تعذّر الحفظ: " + (err.code || err.message), "err");
  } finally {
    btn.disabled = false; btn.textContent = "حفظ";
  }
});

async function removeMember(id) {
  if (!confirm(`حذف المشترك ${id} نهائيًا؟\nلن يستطيع الدخول بعد ذلك.`)) return;
  try {
    await deleteDoc(doc(db, "members", id));
    await loadMembers();
    setMsg($("#admin-msg"), `🗑️ تم حذف <span class="mono" dir="ltr">${id}</span>.`, "warn");
  } catch (err) {
    setMsg($("#admin-msg"), "تعذّر الحذف: " + (err.code || err.message), "err");
  }
}

async function renewMember(id, days) {
  const m = MEMBERS.find(x => x.id === id);
  const base = toDate(m.expiresAt);
  const from = base && base > new Date() ? base : new Date();
  from.setDate(from.getDate() + days);
  try {
    await setDoc(doc(db, "members", id),
      { expiresAt: Timestamp.fromDate(from), status: "active", updatedAt: serverTimestamp() }, { merge: true });
    await loadMembers();
    setMsg($("#admin-msg"), `🔄 تم تجديد <span class="mono" dir="ltr">${id}</span> حتى ${from.toLocaleDateString("ar-EG")}.`, "ok");
  } catch (err) {
    setMsg($("#admin-msg"), "تعذّر التجديد: " + (err.code || err.message), "err");
  }
}

/* ========================= مودال روابط الأقسام ========================= */
const cModal = $("#content-modal");

$("#btn-content").onclick = async () => {
  hide($("#content-msg"));
  const snap = await getDocs(collection(db, "content"));
  const map = {}; snap.docs.forEach(d => map[d.id] = (d.data().url || d.data().path || ""));
  $("#content-list").innerHTML = CATALOG.map(s => `
    <label class="field" style="margin-bottom:12px">
      <span>${s.ar} <small class="mono">(${s.id})</small></span>
      <input class="input mono" dir="ltr" data-content="${s.id}"
             value="${map[s.id] || ""}" placeholder="sections/${s.id}-XXXXXX.html">
    </label>`).join("");
  cModal.hidden = false;
};
$("#content-close").onclick = () => cModal.hidden = true;
cModal.addEventListener("click", e => { if (e.target === cModal) cModal.hidden = true; });

$("#content-save").onclick = async () => {
  const btn = $("#content-save");
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> حفظ…';
  try {
    const batch = writeBatch(db);
    $$("[data-content]").forEach(inp => {
      const url = inp.value.trim();
      if (url) batch.set(doc(db, "content", inp.dataset.content),
        { url, updatedAt: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
    setMsg($("#content-msg"), "✅ تم حفظ روابط الأقسام.", "ok");
  } catch (err) {
    setMsg($("#content-msg"), "تعذّر الحفظ: " + (err.code || err.message), "err");
  } finally {
    btn.disabled = false; btn.textContent = "حفظ الروابط";
  }
};

document.addEventListener("keydown", e => {
  if (e.key === "Escape") { mModal.hidden = true; cModal.hidden = true; }
});
