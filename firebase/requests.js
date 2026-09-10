/* ==========================================================================
   The Pearl Series — طلبات الاشتراك والأسعار
   --------------------------------------------------------------------------
   الفكرة: ولي الأمر يدخل بحساب Google في صفحة «طلب اشتراك»، فيصل بريده
   مؤكَّدًا وبدون كتابة (مهم جدًا على الموبايل)، ويملأ اسمه ورقم هاتفه
   والصفوف المطلوبة. الطلب يظهر في لوحة الإدارة بزرَّي قبول/رفض.

   الحماية في firestore.rules:
     • الإنشاء: لمن سجّل دخوله فقط، وبالبريد الخاص به هو، وبحالة pending.
     • القراءة/القبول/الرفض: للأدمن (وصاحب الطلب يرى طلبه فقط).
   ========================================================================== */

import { db } from "./firebase-config.js";
import {
  collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ------------------------- الأسعار ------------------------- */
const PRICING_DOC = doc(db, "config", "pricing");

/** { p1: 250, p6: 300, currency: "جنيه" } — يقرأها الجميع لعرضها في الاستمارة */
export async function fetchPricing() {
  try {
    const snap = await getDoc(PRICING_DOC);
    return snap.exists() ? snap.data() : {};
  } catch { return {}; }
}

export function savePricing(map) {
  return setDoc(PRICING_DOC, { ...map, updatedAt: serverTimestamp() }, { merge: false });
}

/** حساب الإجمالي لمجموعة أقسام */
export function priceOf(pricing, sectionIds) {
  return sectionIds.reduce((sum, id) => sum + (Number(pricing[id]) || 0), 0);
}

/* ------------------------- الطلبات ------------------------- */
export function submitRequest({ email, name, parent, school, phone, sections, note, total }) {
  return addDoc(collection(db, "requests"), {
    email:  (email  || "").trim().toLowerCase(),
    name:   (name   || "").trim().slice(0, 80),
    parent: (parent || "").trim().slice(0, 80),
    school: (school || "").trim().slice(0, 80),
    phone:  (phone  || "").trim().slice(0, 20),
    sections: Array.isArray(sections) ? sections.slice(0, 20) : [],
    note:  (note || "").trim().slice(0, 300),
    total: Number(total) || 0,
    status: "pending",
    createdAt: serverTimestamp()
  });
}

export async function listRequests() {
  const snap = await getDocs(query(collection(db, "requests"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function setRequestStatus(id, status, extra = {}) {
  return updateDoc(doc(db, "requests", id), { status, handledAt: serverTimestamp(), ...extra });
}

export function deleteRequest(id) {
  return deleteDoc(doc(db, "requests", id));
}
