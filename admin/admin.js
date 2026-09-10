/* ==========================================================================
   The Pearl Series — لوحة إدارة الاشتراكات
   --------------------------------------------------------------------------
   هذه الصفحة لا تحمي نفسها بكلمة مرور في الكود (وهذا مقصود!).
   الحماية أن قواعد Firestore ترفض أي كتابة إلا إذا كان بريدك موجودًا في
   مجموعة admins. لذلك حتى لو فتح شخص هذه الصفحة، لن يستطيع تعديل أي شيء.
   ========================================================================== */

import { db } from "../firebase/firebase-config.js";
import { watchAuth, logout, normalizeEmail, createMemberAccount, generateCode } from "../firebase/auth.js";
import { BRAND } from "../firebase/firebase-config.js";
import { checkIsAdmin, toDate, fetchCatalog } from "../firebase/access-control.js";
import { listRequests, setRequestStatus, deleteRequest, fetchPricing, savePricing } from "../firebase/requests.js";
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
  PRICING = await fetchPricing();
  await loadRequests();
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
let PENDING_REQ = null;

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
  /* كود الدخول يُحدَّد مرة واحدة عند الإنشاء (تغييره لاحقًا يحتاج Firebase Console) */
  $("#f-code").value    = id ? (m.accessCode || "") : generateCode();
  $("#f-code").disabled = !!id;
  $("#code-hint").textContent = id
    ? "لا يمكن تغيير الكود من هنا — من Firebase Console → Authentication."
    : "يُنشأ الحساب بهذا الكود عند الحفظ — أرسله لولي الأمر مع بريده.";
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
$("#member-cancel").onclick = () => { PENDING_REQ = null; mModal.hidden = true; };
mModal.addEventListener("click", e => { if (e.target === mModal) mModal.hidden = true; });

$("#member-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = normalizeEmail($("#f-email").value);
  if (!email.includes("@")) return setMsg($("#form-msg"), "بريد إلكتروني غير صحيح.", "err");

  const secs = getChips();
  const allOn = secs.length === CATALOG.length && CATALOG.length > 0;
  if (!secs.length) return setMsg($("#form-msg"), "اختر قسمًا واحدًا على الأقل.", "err");

  const code = $("#f-code").value.trim();
  if (!EDITING && code.length < 6)
    return setMsg($("#form-msg"), "كود الدخول يجب أن يكون 6 خانات على الأقل.", "err");

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
      await createMemberAccount(email, code);   // إنشاء حساب الدخول
      payload.accessCode = code;                // نحتفظ به لتذكير ولي الأمر
    }
    await setDoc(doc(db, "members", email), payload, { merge: true });

    /* لو الحفظ جاء من قبول طلب: علّم الطلب مقبولًا */
    if (PENDING_REQ) {
      try { await setRequestStatus(PENDING_REQ, "accepted", { memberEmail: email }); } catch {}
      PENDING_REQ = null;
      await loadRequests();
    }

    mModal.hidden = true;
    await loadMembers();

    if (!EDITING) {
      const msg = `أهلًا بك في منصة The Pearl Series 🌟
رابط المنصة: ${location.origin}${location.pathname.replace(/admin\/.*$/, "")}
البريد: ${email}
كود الدخول: ${code}
أ/ ${BRAND.teacher}`;
      setMsg($("#admin-msg"),
        `✅ تم إنشاء حساب <span class="mono" dir="ltr">${email}</span> — كود الدخول:
         <strong class="mono">${code}</strong>
         <a class="btn btn-primary btn-sm" style="margin-inline-start:10px" target="_blank" rel="noopener"
            href="https://wa.me/?text=${encodeURIComponent(msg)}">إرسال البيانات على واتساب</a>`, "ok");
    } else {
      setMsg($("#admin-msg"), `✅ تم حفظ <span class="mono" dir="ltr">${email}</span>.`, "ok");
      setTimeout(() => hide($("#admin-msg")), 4000);
    }
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


document.addEventListener("keydown", e => {
  if (e.key === "Escape") { mModal.hidden = true; cModal.hidden = true; if (typeof pModal !== "undefined") pModal.hidden = true; }
});

/* ========================= محتوى الأقسام: تِرم ← مسار ← وحدة ========================= */
const cModal = $("#content-modal");
let TREE = [];          // شجرة القسم المفتوح حاليًا
let CUR_SEC = null;

const rid = (p) => p + Math.random().toString(36).slice(2, 7);

/* قراءة مستند القسم وتحويل أي شكل قديم إلى الشكل الشجري */
function toTree(data) {
  if (!data) return [];
  if (Array.isArray(data.terms)) {
    return data.terms.map(tm => ({
      id: tm.id || rid("term"), title: tm.title || "", enabled: tm.enabled !== false,
      tracks: (tm.tracks || []).map(tr => ({
        id: tr.id || rid("trk"), title: tr.title || "", enabled: tr.enabled !== false,
        units: (tr.units || []).map(u => ({
          id: u.id || rid("u"), title: u.title || "", url: u.url || u.path || "",
          enabled: u.enabled !== false
        }))
      }))
    }));
  }
  let units = (Array.isArray(data.tracks) ? data.tracks : [])
    .filter(t => t && (t.url || t.path))
    .map(t => ({ id: t.id || rid("u"), title: t.title || "", url: t.url || t.path, enabled: true }));
  if (!units.length && (data.url || data.path))
    units = [{ id: rid("u"), title: "المحتوى", url: data.url || data.path, enabled: true }];
  if (!units.length) return [];
  return [{ id: rid("term"), title: "الترم الأول", enabled: true,
            tracks: [{ id: rid("trk"), title: "المحتوى", enabled: true, units }] }];
}

/* مفتاح مفتوح/مقفول */
function toggleBtn(obj, render) {
  const b = document.createElement("button");
  b.type = "button";
  const paint = () => {
    b.className = "tg " + (obj.enabled ? "tg-on" : "tg-off");
    b.textContent = obj.enabled ? "مفتوح" : "🔒 مقفول";
    b.title = obj.enabled ? "اضغط للقفل" : "اضغط للفتح";
  };
  b.onclick = (e) => { e.preventDefault(); obj.enabled = !obj.enabled; paint(); if (render) render(); };
  paint();
  return b;
}

function delBtn(arr, obj, render) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "track-del"; b.textContent = "✕"; b.title = "حذف";
  b.onclick = (e) => {
    e.preventDefault();
    if (!confirm("تأكيد الحذف؟ لن يُحذف الملف من GitHub، فقط من قائمة المنصة.")) return;
    arr.splice(arr.indexOf(obj), 1); render();
  };
  return b;
}

function textInput(obj, key, ph, cls) {
  const i = document.createElement("input");
  i.className = "input " + (cls || ""); i.type = "text"; i.placeholder = ph;
  i.value = obj[key] || "";
  if (cls && cls.indexOf("mono") >= 0) i.dir = "ltr";
  i.oninput = () => { obj[key] = i.value; };
  i.onclick = (e) => e.preventDefault();   // منع فتح/غلق details عند الكتابة
  return i;
}

function renderTree() {
  const root = $("#tree-root");
  root.innerHTML = "";

  if (!TREE.length) {
    root.innerHTML = '<div class="empty">لا يوجد محتوى لهذا القسم بعد. اضغط «+ إضافة تِرم».</div>';
    return;
  }

  TREE.forEach((term, ti) => {
    const box = document.createElement("details");
    box.className = "tnode tnode-term"; box.open = true;

    const sum = document.createElement("summary");
    sum.innerHTML = '<span class="tbadge">تِرم ' + (ti + 1) + '</span>';
    sum.appendChild(textInput(term, "title", "اسم التِرم (مثال: الترم الأول)"));
    const units = term.tracks.reduce((n, t) => n + t.units.length, 0);
    const cnt = document.createElement("span");
    cnt.className = "sec-count" + (units ? "" : " zero");
    cnt.textContent = units ? (term.tracks.length + " مسار · " + units + " وحدة") : "فارغ";
    sum.appendChild(cnt);
    sum.appendChild(toggleBtn(term, renderTree));
    sum.appendChild(delBtn(TREE, term, renderTree));
    box.appendChild(sum);

    const body = document.createElement("div");
    body.className = "tnode-body";

    term.tracks.forEach((track, ri) => {
      const tb = document.createElement("details");
      tb.className = "tnode tnode-track"; tb.open = true;

      const ts = document.createElement("summary");
      ts.innerHTML = '<span class="tbadge tbadge-2">مسار ' + (ri + 1) + '</span>';
      ts.appendChild(textInput(track, "title", "اسم المسار (مثال: Listening)"));
      const c2 = document.createElement("span");
      c2.className = "sec-count" + (track.units.length ? "" : " zero");
      c2.textContent = track.units.length ? (track.units.length + " وحدة") : "فارغ";
      ts.appendChild(c2);
      ts.appendChild(toggleBtn(track, renderTree));
      ts.appendChild(delBtn(term.tracks, track, renderTree));
      tb.appendChild(ts);

      const ub = document.createElement("div");
      ub.className = "tnode-body";

      track.units.forEach((unit, ui) => {
        const row = document.createElement("div");
        row.className = "unit-row";
        const n = document.createElement("span");
        n.className = "unit-n";
        n.textContent = String(ui + 1).padStart(2, "0");
        row.appendChild(n);
        row.appendChild(textInput(unit, "title", "اسم الوحدة (مثال: Unit 1 — Where Am I)"));
        row.appendChild(textInput(unit, "url", "sections/" + CUR_SEC + "-u01-xxxxxx.html", "mono"));
        row.appendChild(toggleBtn(unit, null));
        row.appendChild(delBtn(track.units, unit, renderTree));
        ub.appendChild(row);
      });

      const addU = document.createElement("button");
      addU.type = "button"; addU.className = "btn btn-ghost btn-sm";
      addU.textContent = "+ إضافة وحدة";
      addU.onclick = () => {
        track.units.push({ id: rid("u"), title: "", url: "", enabled: true });
        renderTree();
      };
      ub.appendChild(addU);
      tb.appendChild(ub);
      body.appendChild(tb);
    });

    const addT = document.createElement("button");
    addT.type = "button"; addT.className = "btn btn-ghost btn-sm";
    addT.textContent = "+ إضافة مسار";
    addT.onclick = () => {
      term.tracks.push({ id: rid("trk"), title: "", enabled: true, units: [] });
      renderTree();
    };
    body.appendChild(addT);
    box.appendChild(body);
    root.appendChild(box);
  });
}

async function loadSectionTree(secId) {
  CUR_SEC = secId;
  const snap = await getDoc(doc(db, "content", secId));
  TREE = toTree(snap.exists() ? snap.data() : null);
  renderTree();
}

$("#btn-content").onclick = async () => {
  hide($("#content-msg"));
  const sel = $("#c-section");
  if (!sel.options.length)
    sel.innerHTML = CATALOG.map(s => '<option value="' + s.id + '">' + s.ar + " (" + s.id + ")</option>").join("");
  cModal.hidden = false;
  await loadSectionTree(sel.value || CATALOG[0].id);
};

$("#c-section").onchange = (e) => loadSectionTree(e.target.value);

$("#add-term").onclick = () => {
  TREE.push({ id: rid("term"), title: "", enabled: true, tracks: [] });
  renderTree();
};

$("#content-close").onclick = () => cModal.hidden = true;
cModal.addEventListener("click", e => { if (e.target === cModal) cModal.hidden = true; });

$("#content-save").onclick = async () => {
  const btn = $("#content-save");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> حفظ…';
  try {
    let nu = 0;
    const terms = TREE.map((tm, i) => ({
      id: tm.id,
      title: (tm.title || "").trim() || ("الترم " + (i + 1)),
      enabled: tm.enabled !== false,
      tracks: (tm.tracks || []).map((tr, j) => ({
        id: tr.id,
        title: (tr.title || "").trim() || ("مسار " + (j + 1)),
        enabled: tr.enabled !== false,
        units: (tr.units || [])
          .filter(u => (u.url || "").trim())
          .map((u, k) => {
            nu++;
            return {
              id: u.id,
              title: (u.title || "").trim() || ("وحدة " + (k + 1)),
              url: u.url.trim(),
              enabled: u.enabled !== false
            };
          })
      }))
    }));

    await setDoc(doc(db, "content", CUR_SEC),
      { terms: terms, tracks: null, url: null, path: null, updatedAt: serverTimestamp() },
      { merge: true });

    setMsg($("#content-msg"),
      "✅ تم حفظ محتوى <strong>" + CUR_SEC + "</strong>: " + terms.length + " تِرم · " + nu + " وحدة.", "ok");
  } catch (err) {
    setMsg($("#content-msg"), "تعذّر الحفظ: " + (err.code || err.message), "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "حفظ محتوى هذا القسم";
  }
};

/* ========================= طلبات الاشتراك + الأسعار ========================= */
let REQS = [], PRICING = {}, SHOW_DONE = false;

const curr = () => PRICING.currency || "جنيه";
const secName = (id) => (CATALOG.find(c => c.id === id) || {}).ar || id;

async function loadRequests() {
  try { REQS = await listRequests(); }
  catch (err) { REQS = []; console.warn("requests:", err.code || err.message); }
  renderRequests();
}

function renderRequests() {
  const pend = REQS.filter(r => r.status === "pending");
  const badge = $("#req-badge");
  badge.textContent = pend.length;
  badge.hidden = pend.length === 0;

  const list = SHOW_DONE ? REQS : pend;
  const box = $("#req-list");

  if (!list.length) {
    box.innerHTML = '<div class="empty">' +
      (SHOW_DONE ? "لا توجد طلبات." : "لا توجد طلبات جديدة بانتظارك.") + "</div>";
    return;
  }

  box.innerHTML = list.map(r => {
    const when = r.createdAt && r.createdAt.toDate
      ? r.createdAt.toDate().toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : "";
    const cls = r.status === "accepted" ? " done" : r.status === "rejected" ? " no" : "";
    const secs = (r.sections || []).map(s => "<span>" + secName(s) + "</span>").join("");
    const wa = r.phone ? r.phone.replace(/^0/, "20").replace(/\D/g, "") : "";
    return '<div class="req-card' + cls + '">' +
      '<div class="req-main">' +
        "<h4>" + (r.name || "بدون اسم") + "</h4>" +
        (r.parent ? "<p class=\"req-line\">👤 ولي الأمر: <b>" + r.parent + "</b></p>" : "") +
        (r.school ? "<p class=\"req-line\">🏫 " + r.school + "</p>" : "") +
        '<p class="req-line mono" dir="ltr">' + r.email + "</p>" +
        '<p class="req-line">📱 <b>' + (r.phone || "—") + "</b> · " + when + "</p>" +
        (r.note ? '<p class="req-line">📝 ' + r.note + "</p>" : "") +
        '<div class="req-secs">' + secs + "</div>" +
      "</div>" +
      '<div class="req-actions">' +
        (r.total ? '<span class="req-total">' + r.total + " " + curr() + "</span>" : "") +
        (wa ? '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/' + wa + '">واتساب</a>' : "") +
        (r.status === "pending"
          ? '<button class="btn btn-primary btn-sm" data-acc="' + r.id + '">✓ قبول</button>' +
            '<button class="btn btn-danger btn-sm" data-rej="' + r.id + '">✕ رفض</button>'
          : '<span class="pill pill-' + (r.status === "accepted" ? "active" : "expired") + '">' +
            (r.status === "accepted" ? "مقبول" : "مرفوض") + "</span>" +
            '<button class="btn btn-ghost btn-sm" data-del="' + r.id + '">حذف</button>') +
      "</div></div>";
  }).join("");

  $$("[data-acc]").forEach(b => b.onclick = () => acceptRequest(b.dataset.acc));
  $$("[data-rej]").forEach(b => b.onclick = () => rejectRequest(b.dataset.rej));
  $$("#req-list [data-del]").forEach(b => b.onclick = async () => {
    if (!confirm("حذف هذا الطلب نهائيًا؟")) return;
    await deleteRequest(b.dataset.del); await loadRequests();
  });
}

$("#req-toggle").onclick = () => {
  SHOW_DONE = !SHOW_DONE;
  $("#req-toggle").textContent = SHOW_DONE ? "إظهار الجديدة فقط" : "إظهار المنفَّذة";
  renderRequests();
};

/* القبول: يفتح نافذة إضافة مشترك مملوءة ببيانات الطلب */
function acceptRequest(id) {
  const r = REQS.find(x => x.id === id);
  if (!r) return;
  PENDING_REQ = id;
  openMember(null);
  $("#f-email").value = r.email;
  $("#f-name").value  = r.name  || "";
  $("#f-phone").value = r.phone || "";
  setChips(r.sections || []);
  const y = new Date(); y.setDate(y.getDate() + 365);
  $("#f-expires").value = y.toISOString().slice(0, 10);
  $("#f-notes").value = (r.parent ? "ولي الأمر: " + r.parent + " — " : "") +
    (r.school ? "المدرسة: " + r.school + " — " : "") + "من طلب اشتراك بتاريخ " +
    (r.createdAt && r.createdAt.toDate ? r.createdAt.toDate().toLocaleDateString("ar-EG") : "") +
    (r.total ? " — الإجمالي " + r.total + " " + curr() : "") + (r.note ? " — " + r.note : "");
  setMsg($("#form-msg"), "هذه البيانات جاءت من طلب ولي الأمر — راجعها ثم اضغط حفظ لإنشاء الحساب.", "info");
}

async function rejectRequest(id) {
  if (!confirm("رفض هذا الطلب؟")) return;
  try { await setRequestStatus(id, "rejected"); await loadRequests(); }
  catch (err) { setMsg($("#admin-msg"), "تعذّر الرفض: " + (err.code || err.message), "err"); }
}

/* ------------------------- الأسعار ------------------------- */
const pModal = $("#price-modal");

$("#btn-prices").onclick = async () => {
  hide($("#price-msg"));
  PRICING = await fetchPricing();
  $("#p-currency").value = PRICING.currency || "جنيه";
  $("#price-list").innerHTML = CATALOG.map(s =>
    '<div class="price-row"><span>' + s.ar + ' <small class="mono">(' + s.id + ')</small></span>' +
    '<input class="input mono" type="number" min="0" step="5" dir="ltr" data-price="' + s.id +
    '" value="' + (Number(PRICING[s.id]) || "") + '" placeholder="0"></div>').join("");
  pModal.hidden = false;
};
$("#price-close").onclick = () => pModal.hidden = true;
pModal.addEventListener("click", e => { if (e.target === pModal) pModal.hidden = true; });

$("#price-save").onclick = async () => {
  const btn = $("#price-save");
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> حفظ…';
  try {
    const map = { currency: ($("#p-currency").value.trim() || "جنيه") };
    $$("[data-price]").forEach(i => {
      const v = Number(i.value);
      if (v > 0) map[i.dataset.price] = v;
    });
    await savePricing(map);
    PRICING = map;
    renderRequests();
    setMsg($("#price-msg"), "✅ تم حفظ الأسعار — ستظهر فورًا في استمارة الاشتراك.", "ok");
  } catch (err) {
    setMsg($("#price-msg"), "تعذّر الحفظ: " + (err.code || err.message), "err");
  } finally {
    btn.disabled = false; btn.textContent = "حفظ الأسعار";
  }
};
