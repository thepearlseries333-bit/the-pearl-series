/* ==========================================================================
   The Pearl Series — منطق استمارة طلب الاشتراك
   ========================================================================== */

import { BRAND } from "../../firebase/firebase-config.js";
import { loginWithGoogle, watchAuth, logout, authErrorAr, normalizeEmail } from "../../firebase/auth.js";
import { fetchCatalog } from "../../firebase/access-control.js";
import { fetchPricing, priceOf, submitRequest } from "../../firebase/requests.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* ---------- المظهر ---------- */
const KEY = "pearl.theme", root = document.documentElement;
function applyTheme(t) {
  root.dataset.theme = t;
  $("#theme-btn").textContent = t === "dark" ? "☀️" : "🌙";
  try { localStorage.setItem(KEY, t); } catch {}
}
(function () {
  let t = null; try { t = localStorage.getItem(KEY); } catch {}
  applyTheme(t || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
})();
$("#theme-btn").addEventListener("click", () =>
  applyTheme(root.dataset.theme === "dark" ? "light" : "dark"));

$("#year").textContent = new Date().getFullYear();

function setMsg(el, html, kind = "info") { el.className = "msg msg-" + kind; el.innerHTML = html; el.hidden = false; }
function show(id) {
  ["step-auth", "step-form", "step-done"].forEach(s => $("#" + s).hidden = (s !== id));
}

let CATALOG = [], PRICING = {}, USER = null;

/* ---------- الدخول بحساب Google (لتحديد البريد فقط) ---------- */
const gbtn = $("#google-btn");
gbtn.addEventListener("click", async () => {
  const html = gbtn.innerHTML;
  gbtn.disabled = true;
  gbtn.innerHTML = '<span class="spinner"></span> جارٍ فتح نافذة Google…';
  try { await loginWithGoogle(); }
  catch (err) { setMsg($("#auth-msg"), authErrorAr(err), "err"); }
  finally { gbtn.disabled = false; gbtn.innerHTML = html; }
});

$("#switch-btn").addEventListener("click", () => logout().then(() => location.reload()));

watchAuth(async (user) => {
  if (!user) { USER = null; show("step-auth"); return; }
  USER = user;

  const email = normalizeEmail(user.email);
  $("#who-email").textContent = email;
  $("#who-name").textContent  = user.displayName || "مرحبًا بك";
  $("#who-letter").textContent = (user.displayName || email)[0].toUpperCase();
  if (user.displayName && !$("#f-name").value) $("#f-name").value = user.displayName;

  if (!CATALOG.length) {
    [CATALOG, PRICING] = await Promise.all([fetchCatalog(), fetchPricing()]);
    buildPicker();
  }
  show("step-form");
});

/* ---------- بطاقات اختيار الصفوف مع الأسعار ---------- */
const money = (n) => Number(n).toLocaleString("ar-EG");

function buildPicker() {
  const cur = PRICING.currency || "جنيه";
  $("#f-sections").innerHTML = CATALOG.map(s => {
    const p = Number(PRICING[s.id]) || 0;
    return `
      <button type="button" class="pick" data-id="${s.id}">
        <span class="pick-ico">${s.icon || "★"}</span>
        <span class="pick-txt">
          <strong>${s.ar}</strong>
          <small>${s.en || ""}</small>
        </span>
        <span class="pick-price">${p ? money(p) + " " + cur : "حسب الاتفاق"}</span>
      </button>`;
  }).join("");

  $$("#f-sections .pick").forEach(b => b.addEventListener("click", () => {
    b.classList.toggle("on");
    updateTotal();
  }));
  updateTotal();
}

function picked() { return $$("#f-sections .pick.on").map(b => b.dataset.id); }

function updateTotal() {
  const ids = picked();
  const total = priceOf(PRICING, ids);
  const cur = PRICING.currency || "جنيه";
  const unpriced = ids.some(id => !Number(PRICING[id]));
  $("#total-val").textContent = ids.length === 0 ? "—"
    : (total ? money(total) + " " + cur : "حسب الاتفاق") + (unpriced && total ? " + حسب الاتفاق" : "");
}

/* ---------- إرسال الطلب ---------- */
const IPA = "mr.youssefosman17880@instapay";

$("#copy-ipa").addEventListener("click", async () => {
  const btn = $("#copy-ipa");
  try { await navigator.clipboard.writeText(IPA); }
  catch {
    const r = document.createRange(); r.selectNode($("#pay-ipa"));
    getSelection().removeAllRanges(); getSelection().addRange(r);
    try { document.execCommand("copy"); } catch {}
  }
  btn.textContent = "✓ تم النسخ";
  setTimeout(() => btn.textContent = "نسخ", 2000);
});

$("#join-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name   = $("#f-name").value.trim();
  const parent = $("#f-parent").value.trim();
  const school = $("#f-school").value.trim();
  const phone  = $("#f-phone").value.trim();
  const ids    = picked();
  const note   = $("#f-note").value.trim();

  if (name.length < 3)   return setMsg($("#form-msg"), "اكتب اسم الطالب كاملًا.", "err");
  if (parent.length < 3) return setMsg($("#form-msg"), "اكتب اسم ولي الأمر.", "err");
  if (phone.length < 8)  return setMsg($("#form-msg"), "اكتب رقم واتساب صحيحًا.", "err");
  if (!ids.length)       return setMsg($("#form-msg"), "اختر صفًا واحدًا على الأقل.", "err");

  const btn = $("#send-btn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> جارٍ الإرسال…';
  try {
    const total = priceOf(PRICING, ids);
    await submitRequest({ email: normalizeEmail(USER.email), name, parent, school,
                          phone, sections: ids, note, total });

    const cur   = PRICING.currency || "جنيه";
    const names = ids.map(id => (CATALOG.find(c => c.id === id) || {}).ar || id).join("، ");
    const txt = `السلام عليكم أ/ ${BRAND.teacher}\nأرسلت طلب اشتراك من المنصة:\n` +
                `الطالب: ${name}\nولي الأمر: ${parent}\n` + (school ? `المدرسة: ${school}\n` : "") +
                `البريد: ${normalizeEmail(USER.email)}\nالصفوف: ${names}\n` +
                (total ? `الإجمالي: ${total} ${cur}\n` : "") +
                `\nمرفق إيصال التحويل على إنستاباي.`;
    $("#done-wa").href = `https://wa.me/${BRAND.whatsapp}?text=${encodeURIComponent(txt)}`;
    $("#pay-amount").textContent = total ? money(total) + " " + cur : "المبلغ حسب الاتفاق";
    show("step-done");
  } catch (err) {
    setMsg($("#form-msg"), "تعذّر الإرسال: " + (err.code || err.message) +
      "<br><small>تأكد من الاتصال بالإنترنت وحاول مرة أخرى.</small>", "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "إرسال الطلب";
  }
});
