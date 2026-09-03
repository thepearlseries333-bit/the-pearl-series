/* ==========================================================================
   The Pearl Series — حارس ملفات الأقسام (الطبقة الثانية من الحماية)
   --------------------------------------------------------------------------
   طريقة الاستخدام: ضع هذين السطرين داخل <head> في أي ملف قسم تفاعلي:

     <style id="pearl-guard-style">body{visibility:hidden}</style>
     <script type="module" src="../assets/js/section-guard.js" data-section="p1"></script>

   ماذا يفعل؟ يخفي الصفحة، يتأكد من تسجيل الدخول ومن أن هذا القسم ضمن
   اشتراك المستخدم (عبر Firestore)، ثم يُظهر الصفحة. وإن لم يكن مشتركًا
   يعرض شاشة "غير مشترك" ويعيده للصفحة الرئيسية.

   تنبيه صادق: هذا الحارس يعمل داخل المتصفح، وهو *ليس* الحماية الأساسية.
   الحماية الأساسية أن اسم الملف عشوائي ومساره مخزّن في Firestore داخل
   مجموعة content المحميّة بقواعد الأمان — فمن ليس مشتركًا لا يعرف الرابط أصلًا.
   ========================================================================== */

import { normalizeEmail, watchAuth } from "../../firebase/auth.js";
import { fetchMember, evaluateMember, hasAccess } from "../../firebase/access-control.js";

const tag       = document.querySelector("script[data-section]");
const SECTION   = tag ? tag.dataset.section : "";
const HOME      = tag && tag.dataset.home ? tag.dataset.home : "../index.html";

function reveal() {
  const s = document.getElementById("pearl-guard-style");
  if (s) s.remove();
  document.body.style.visibility = "visible";
}

function block(title, text) {
  document.documentElement.setAttribute("dir", "rtl");
  document.body.innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;padding:24px;
                font-family:Cairo,Segoe UI,Tahoma,sans-serif;background:#F6F4EF;color:#101418">
      <div style="max-width:440px;text-align:center;background:#fff;border:1px solid rgba(18,58,112,.14);
                  border-radius:28px;padding:36px 28px;box-shadow:0 18px 48px rgba(7,24,47,.16)">
        <img src="../assets/img/pearl-logo.jpg" alt="The Pearl Series" style="height:70px;margin:0 auto 14px">
        <h2 style="margin:0 0 8px;color:#123A70">${title}</h2>
        <p style="color:#5A6472;margin:0 0 20px">${text}</p>
        <a href="${HOME}" style="display:inline-block;background:#123A70;color:#fff;text-decoration:none;
           padding:11px 22px;border-radius:999px;font-weight:700">العودة للصفحة الرئيسية</a>
      </div>
    </div>`;
  reveal();
}

watchAuth(async (user) => {
  if (!user) return block("يجب تسجيل الدخول أولًا", "هذا المحتوى متاح للمشتركين فقط.");
  try {
    const member = await fetchMember(normalizeEmail(user.email));
    const ev     = evaluateMember(member);
    if (!ev.ok)                      return block("اشتراكك غير نشط", ev.reason);
    if (!hasAccess(ev, SECTION))     return block("هذا القسم غير مفتوح لك", "قسم غير مشمول في اشتراكك الحالي.");
    reveal();
  } catch {
    block("تعذّر التحقق من الاشتراك", "تأكد من اتصالك بالإنترنت ثم أعد تحميل الصفحة.");
  }
});
