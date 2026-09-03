/* ==========================================================================
   The Pearl Series — إعدادات Firebase
   --------------------------------------------------------------------------
   ملاحظة أمنية مهمة (اقرأها):
   القيم بالأسفل ليست "أسرارًا". أي مشروع Firebase على الويب يعرضها في الكود،
   وهي مجرد عنوان يقول للمتصفح: "اتصل بمشروع Firebase رقم كذا".
   الحماية الحقيقية تأتي من شيئين فقط:
     1) Firebase Authentication  → مَن أنت؟
     2) Firestore Security Rules → وماذا يحق لك أن تقرأ/تكتب؟
   لذلك رفع هذا الملف على GitHub أمر طبيعي وآمن ما دامت قواعد Firestore محكمة
   (انظر ملف firestore.rules في جذر المشروع).
   ========================================================================== */

import { initializeApp }   from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth }         from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore }    from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* إعدادات مشروع the-pearl-series على Firebase.
   المصدر: Firebase Console → ⚙️ Project settings → General → Your apps → Web app */
export const firebaseConfig = {
  apiKey:            "AIzaSyAocSgv7EHc8cb0zrqv4m9Bo4HG47qUKBI",
  authDomain:        "the-pearl-series.firebaseapp.com",
  projectId:         "the-pearl-series",
  storageBucket:     "the-pearl-series.firebasestorage.app",
  messagingSenderId: "605233823596",
  appId:             "1:605233823596:web:a125e07d270349c27e7d49",
  measurementId:     "G-N27KZV859C"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

/* اسم المدرّس وبيانات التواصل التي تظهر في الواجهة ورسائل "غير مشترك" */
export const BRAND = {
  teacher:  "Youssef Osman",
  series:   "The Pearl Series",
  tagline:  "Five Stars in English",
  whatsapp: "201000679764",           // ← عدّل رقمك بصيغة دولية بدون +
  contactText: "للاشتراك تواصل معنا على واتساب"
};
