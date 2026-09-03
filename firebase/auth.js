/* ==========================================================================
   The Pearl Series — منطق تسجيل الدخول (رابط بالبريد الإلكتروني / Passwordless)
   --------------------------------------------------------------------------
   لماذا "رابط بالبريد" بدلًا من كلمة المرور؟
   • لا يوجد تسجيل ذاتي بكلمة مرور، ولا نسيان لكلمات المرور ولا إعادة تعيين.
   • البريد يتحقق من نفسه: من يفتح الرابط هو من يملك البريد فعلًا.
   • مشاركة الحساب أصعب (كل دخول جديد يحتاج الوصول لصندوق البريد).
   ملاحظة: أي شخص يستطيع "طلب" رابط دخول، لكن ذلك لا يمنحه أي محتوى؛
   الصلاحية تُحسم بعد الدخول من مجموعة members في Firestore وبقواعد الأمان.
   ========================================================================== */

import { auth } from "./firebase-config.js";
import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const EMAIL_KEY = "pearl.pendingEmail";

/** توحيد صيغة البريد: حروف صغيرة وبدون فراغات (مهم لأن معرّف المستند = البريد) */
export const normalizeEmail = (e) => (e || "").trim().toLowerCase();

/** تبقى الجلسة محفوظة على الجهاز حتى تسجيل الخروج يدويًا */
await setPersistence(auth, browserLocalPersistence).catch(() => {});

/** إرسال رابط الدخول إلى بريد المستخدم */
export async function sendLoginLink(rawEmail) {
  const email = normalizeEmail(rawEmail);
  const url = window.location.origin + window.location.pathname;
  await sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true });
  localStorage.setItem(EMAIL_KEY, email);
  return email;
}

/** هل الرابط الحالي هو رابط دخول قادم من البريد؟ */
export function isLoginLink() {
  return isSignInWithEmailLink(auth, window.location.href);
}

/**
 * إكمال الدخول عند فتح الرابط.
 * إن فُتح الرابط على متصفح/جهاز آخر لا يعرف البريد، نطلبه عبر askEmail().
 */
export async function completeLoginFromLink(askEmail) {
  let email = localStorage.getItem(EMAIL_KEY);
  if (!email && typeof askEmail === "function") email = normalizeEmail(await askEmail());
  if (!email) throw new Error("no-email");

  const res = await signInWithEmailLink(auth, email, window.location.href);
  localStorage.removeItem(EMAIL_KEY);
  // تنظيف الرابط من الرموز الطويلة حتى لا تبقى في شريط العنوان
  history.replaceState({}, document.title, window.location.pathname);
  return res.user;
}

export function watchAuth(cb) { return onAuthStateChanged(auth, cb); }
export function logout() { return signOut(auth); }

/** رسائل أخطاء Firebase مترجمة لعربية مفهومة لولي الأمر */
export function authErrorAr(err) {
  const c = err && err.code ? err.code : "";
  const map = {
    "auth/invalid-email":            "صيغة البريد الإلكتروني غير صحيحة.",
    "auth/missing-email":            "من فضلك اكتب بريدك الإلكتروني.",
    "auth/invalid-action-code":      "هذا الرابط منتهي أو تم استخدامه من قبل. اطلب رابطًا جديدًا.",
    "auth/expired-action-code":      "انتهت صلاحية الرابط. اطلب رابط دخول جديدًا.",
    "auth/too-many-requests":        "تم إرسال محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.",
    "auth/network-request-failed":   "تعذّر الاتصال بالإنترنت. تأكد من الشبكة وحاول مجددًا.",
    "auth/unauthorized-continue-uri":"نطاق الموقع غير مُصرّح به في إعدادات Firebase (Authorized domains).",
    "auth/operation-not-allowed":    "طريقة الدخول غير مفعّلة في Firebase Console."
  };
  return map[c] || "حدث خطأ غير متوقع. حاول مرة أخرى." + (c ? " (" + c + ")" : "");
}
