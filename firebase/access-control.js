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
 * مسارات القسم (الكتب/الموضوعات داخل الصف الواحد).
 *
 * مستند content/{sectionId} محمي بالقواعد؛ إن لم تكن مشتركًا في هذا القسم
 * سترجع Firestore خطأ permission-denied ولن تصلك المسارات أبدًا.
 *
 * شكل المستند:
 *   content/p1 = { tracks: [ {id, title, url, desc}, ... ] }
 * ويُدعَم الشكل القديم (رابط واحد) تلقائيًا: { url: "sections/p1-x.html" }
 */
export async function fetchSectionTracks(sectionId) {
  const snap = await getDoc(doc(db, "content", sectionId));
  if (!snap.exists()) throw new Error("not-published");
  const data = snap.data();

  let list = Array.isArray(data.tracks) ? data.tracks : [];
  list = list.filter(t => t && (t.url || t.path));

  if (!list.length) {                       // توافق مع الشكل القديم
    const legacy = data.url || data.path;
    if (legacy) list = [{ id: "main", title: "المحتوى", url: legacy }];
  }
  if (!list.length) throw new Error("not-published");

  return list.map((t, i) => ({
    id:    t.id    || ("t" + (i + 1)),
    title: t.title || ("مسار " + (i + 1)),
    desc:  t.desc  || "",
    url:   t.url   || t.path
  }));
}

/**
 * شجرة محتوى القسم: تِرم ← مسار ← وحدة.
 *
 * شكل المستند الحديث:
 *   content/p1 = { terms:[ { id,title,enabled, tracks:[ { id,title,enabled,
 *                             units:[ {id,title,url,desc,enabled} ] } ] } ] }
 *
 * ويُدعَم القديم تلقائيًا: { tracks:[{title,url}] } أو { url:"..." }
 * فيُحوَّل إلى تِرم واحد بلا اسم ← مسار واحد بلا اسم ← وحدات.
 * (الواجهة تتخطّى أي مستوى لا يحمل اسمًا وفيه عنصر واحد.)
 */
export async function fetchSectionTree(sectionId) {
  const snap = await getDoc(doc(db, "content", sectionId));
  if (!snap.exists()) throw new Error("not-published");
  const data = snap.data();

  const clean = (v) => (typeof v === "string" ? v.trim() : "");
  const on    = (v) => v !== false;               // الافتراضي: مفتوح

  let terms = Array.isArray(data.terms) ? data.terms : null;

  if (!terms) {                                    // ترقية الأشكال القديمة
    let units = Array.isArray(data.tracks) ? data.tracks : [];
    units = units.filter(u => u && (u.url || u.path));
    if (!units.length && (data.url || data.path))
      units = [{ id: "main", title: "المحتوى", url: data.url || data.path }];
    if (!units.length) throw new Error("not-published");
    terms = [{ id: "main", title: "", enabled: true,
               tracks: [{ id: "main", title: "", enabled: true, units }] }];
  }

  const tree = terms.map((tm, i) => ({
    id:      clean(tm.id) || ("term" + (i + 1)),
    title:   clean(tm.title),
    enabled: on(tm.enabled),
    tracks: (Array.isArray(tm.tracks) ? tm.tracks : []).map((tr, j) => ({
      id:      clean(tr.id) || ("track" + (j + 1)),
      title:   clean(tr.title),
      enabled: on(tr.enabled),
      units: (Array.isArray(tr.units) ? tr.units : [])
        .filter(u => u && (u.url || u.path))
        .map((u, k) => ({
          id:      clean(u.id) || ("unit" + (k + 1)),
          title:   clean(u.title) || ("وحدة " + (k + 1)),
          desc:    clean(u.desc),
          url:     clean(u.url) || clean(u.path),
          enabled: on(u.enabled)
        }))
    }))
  }));

  const any = tree.some(tm => tm.tracks.some(tr => tr.units.length));
  if (!any) throw new Error("not-published");
  return tree;
}
