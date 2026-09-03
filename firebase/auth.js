/* ==========================================================================
   The Pearl Series — منطق تسجيل الدخول (بريد إلكتروني + كلمة مرور)
   --------------------------------------------------------------------------
   لماذا تحوّلنا من "رابط البريد" إلى كلمة المرور؟
   لأن خدمة الإرسال المدمجة في Firebase لم تكن تُسلّم الرسائل (جُرّبت على أكثر
   من بريد ولم تصل ولا حتى إلى Spam). الاعتماد على الإيميل كان سيمنع أولياء
   الأمور من الدخول. الآن:
     • أنت تنشئ الحساب من لوحة الإدارة وتحدد "كود الدخول" (كلمة المرور).
     • ترسله لولي الأمر على واتساب مع تأكيد الدفع.
     • لا يوجد تسجيل ذاتي: لا أحد يستطيع إنشاء حساب لنفسه من الموقع.
   ========================================================================== */

import { auth, app, firebaseConfig } from "./firebase-config.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

/** توحيد صيغة البريد: حروف صغيرة وبدون فراغات (معرّف المستند = البريد) */
export const normalizeEmail = (e) => (e || "").trim().toLowerCase();

/** تبقى الجلسة محفوظة على الجهاز حتى تسجيل الخروج يدويًا */
await setPersistence(auth, browserLocalPersistence).catch(() => {});

/**
 * الدخول بحساب Google — الطريقة الأساسية.
 * لا كلمة مرور تُتداول، ولا اعتماد على وصول رسائل بريد.
 * الدخول هنا لا يعني الوصول للمحتوى: إن لم يكن البريد مسجّلًا في members
 * فسيرى المستخدم شاشة "هذا البريد غير مُفعّل" ولن تسمح له القواعد بقراءة أي قسم.
 */
export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    return await signInWithPopup(auth, provider);
  } catch (err) {
    // بعض متصفحات الموبايل تحجب النوافذ المنبثقة → نحوّل للصفحة كاملة
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment",
         "auth/cancelled-popup-request"].includes(err.code)) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

/** الدخول بكود (بديل لمن ليس لديه حساب Google) */
export function login(email, password) {
  return signInWithEmailAndPassword(auth, normalizeEmail(email), password);
}

/**
 * إنشاء حساب لمشترك جديد — للأدمن فقط من لوحة الإدارة.
 * نستخدم نسخة ثانية من تطبيق Firebase حتى لا يخرج الأدمن من حسابه؛
 * لأن createUser يسجّل الدخول تلقائيًا بالحساب الجديد في النسخة المستخدمة.
 */
export async function createMemberAccount(email, password) {
  const secondary = initializeApp(firebaseConfig, "pearl-admin-worker-" + Date.now());
  const secAuth = getAuth(secondary);
  try {
    await createUserWithEmailAndPassword(secAuth, normalizeEmail(email), password);
    return { created: true };
  } catch (err) {
    if (err.code === "auth/email-already-in-use") return { created: false, existed: true };
    throw err;
  } finally {
    await signOut(secAuth).catch(() => {});
    await deleteApp(secondary).catch(() => {});
  }
}

/** كود دخول عشوائي سهل القراءة (بدون حروف/أرقام متشابهة) */
export function generateCode(len = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const rnd = crypto.getRandomValues(new Uint32Array(len));
  for (let i = 0; i < len; i++) out += alphabet[rnd[i] % alphabet.length];
  return out;
}

export function watchAuth(cb) { return onAuthStateChanged(auth, cb); }
export function logout() { return signOut(auth); }

/** رسائل أخطاء Firebase مترجمة لعربية مفهومة لولي الأمر */
export function authErrorAr(err) {
  const c = err && err.code ? err.code : "";
  const map = {
    "auth/invalid-email":          "صيغة البريد الإلكتروني غير صحيحة.",
    "auth/missing-email":          "من فضلك اكتب بريدك الإلكتروني.",
    "auth/missing-password":       "من فضلك اكتب كود الدخول.",
    "auth/invalid-credential":     "البريد أو كود الدخول غير صحيح. تأكد منهما أو تواصل معنا.",
    "auth/wrong-password":         "كود الدخول غير صحيح.",
    "auth/user-not-found":         "هذا البريد غير مُسجَّل لدينا. تواصل معنا للاشتراك.",
    "auth/user-disabled":          "تم إيقاف هذا الحساب. تواصل معنا.",
    "auth/weak-password":          "كود الدخول قصير جدًا — 6 خانات على الأقل.",
    "auth/email-already-in-use":   "هذا البريد له حساب بالفعل.",
    "auth/too-many-requests":      "محاولات كثيرة خاطئة. انتظر دقائق ثم حاول مجددًا.",
    "auth/network-request-failed": "تعذّر الاتصال بالإنترنت. تأكد من الشبكة وحاول مجددًا.",
    "auth/operation-not-allowed":  "طريقة الدخول غير مفعّلة في Firebase Console.",
    "auth/popup-closed-by-user":   "تم إغلاق نافذة Google قبل إتمام الدخول. حاول مرة أخرى.",
    "auth/unauthorized-domain":    "نطاق الموقع غير مُصرّح به في إعدادات Firebase (Authorized domains).",
    "auth/account-exists-with-different-credential":
      "هذا البريد مسجّل بطريقة دخول مختلفة. استخدم كود الدخول أو تواصل معنا."
  };
  return map[c] || "حدث خطأ غير متوقع. حاول مرة أخرى." + (c ? " (" + c + ")" : "");
}
