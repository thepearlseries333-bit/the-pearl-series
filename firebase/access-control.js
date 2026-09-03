/* ==========================================================================
   The Pearl Series — منطق الصلاحيات (فتح/قفل الأقسام)
   --------------------------------------------------------------------------
   القاعدة الذهبية: كل ما هنا هو "واجهة" فقط.
   القرار النهائي يتخذه Firestore عبر firestore.rules:
     • قراءة members/{email}  → لصاحب البريد أو للأدمن فقط.
     • قراءة content/{sectionId} → فقط إذا كان الاشتراك نشطًا وغير منتهٍ
       والقسم ضمن صفوف المشترك. وهذا المستند يحوي المسار الحقيقي لملف القسم.
   لذلك حتى لو عدّل أحدهم جافاسكريبت من متصفحه، لن يحصل على رابط الملف.
   ========================================================================== */

import { db } from "./firebase-config.js";
import {
  doc, getDoc, getDocs, collection, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { DEFAULT_SECTIONS } from "../assets/js/catalog.js";

/** جلب مستند المشترك. يرجع null إن لم يكن البريد مسجّلًا عندك. */
export async function fetchMember(email) {
  const snap = await getDoc(doc(db, "members", email));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** هل هذا البريد أدمن؟ (مجموعة admins تُدار من Firebase Console يدويًا) */
export async function checkIsAdmin(email) {
  try {
    const snap = await getDoc(doc(db, "admins", email));
    return snap.exists();
  } catch { return false; }
}

/** تحويل قيمة التاريخ (Timestamp أو نص) إلى Date أو null */
export function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

/**
 * تقييم حالة الاشتراك لعرضها في الواجهة.
 * يرجع: { ok, state, reason, sections[], expiresAt, daysLeft }
 */
export function evaluateMember(member) {
  if (!member) {
    return { ok:false, state:"unregistered", reason:"هذا البريد غير مُفعّل لدينا.", sections:[], expiresAt:null, daysLeft:null };
  }
  const sections  = Array.isArray(member.sections) ? member.sections : [];
  const expiresAt = toDate(member.expiresAt);
  const now       = new Date();

  if (member.status === "suspended")
    return { ok:false, state:"suspended", reason:"تم إيقاف هذا الحساب مؤقتًا.", sections, expiresAt, daysLeft:null };

  if (expiresAt && expiresAt < now)
    return { ok:false, state:"expired", reason:"انتهت صلاحية اشتراكك. جدّد الاشتراك للمتابعة.", sections, expiresAt, daysLeft:0 };

  if (member.status !== "active")
    return { ok:false, state:"inactive", reason:"الاشتراك غير نشط حاليًا.", sections, expiresAt, daysLeft:null };

  const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 86400000)) : null;
  return { ok:true, state:"active", reason:"", sections, expiresAt, daysLeft };
}

/** هل القسم مفتوح لهذا المشترك؟ (للعرض فقط) */
export function hasAccess(evaluation, sectionId) {
  return !!evaluation.ok && (evaluation.sections.includes("*") || evaluation.sections.includes(sectionId));
}

/**
 * كتالوج الأقسام: من Firestore إن وُجد، وإلا القائمة الافتراضية في catalog.js
 */
export async function fetchCatalog() {
  try {
    const snap = await getDocs(query(collection(db, "sections"), orderBy("order")));
    if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { /* تجاهل: نستخدم الافتراضي */ }
  return [...DEFAULT_SECTIONS].sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * الحصول على الرابط الحقيقي لملف القسم.
 * مستند content/{sectionId} محمي بالقواعد؛ إن لم تكن مشتركًا سترجع Firestore
 * خطأ permission-denied ولن يصلك المسار أبدًا.
 */
export async function resolveSectionUrl(sectionId) {
  const snap = await getDoc(doc(db, "content", sectionId));
  if (!snap.exists()) throw new Error("not-published");
  const data = snap.data();
  return data.url || data.path;   // مثال: "sections/p1-a7f3c2e9.html"
}
