/* ==========================================================================
   The Pearl Series — كتالوج الأقسام (الافتراضي)
   --------------------------------------------------------------------------
   هذه هي البطاقات التي تظهر في الواجهة. تستطيع تعديلها من هنا مباشرة،
   أو (الأفضل) إضافتها في Firestore داخل مجموعة `sections` ليقرأها الموقع
   ديناميكيًا بدون تعديل كود — إن وُجدت في Firestore فهي تتجاوز هذه القائمة.

   id     : المعرّف المستخدم في صلاحيات الطالب وفي مجموعة content
   ar/en  : اسم القسم بالعربية/الإنجليزية
   group  : المجموعة التي يظهر تحتها في الصفحة
   icon   : نص قصير يظهر داخل الأيقونة
   order  : ترتيب الظهور
   ========================================================================== */

export const GROUPS = [
  { id: "foundation", ar: "التأسيس",            en: "Foundation" },
  { id: "primary",    ar: "المرحلة الابتدائية",  en: "Primary" },
  { id: "prep",       ar: "المرحلة الإعدادية",   en: "Preparatory" },
  { id: "secondary",  ar: "المرحلة الثانوية",    en: "Secondary" },
  { id: "extra",      ar: "أقسام إضافية",        en: "Extras" }
];

export const DEFAULT_SECTIONS = [
  { id:"found",  ar:"التأسيس",              en:"Foundation",      group:"foundation", icon:"A B C", order:1 },

  { id:"p1", ar:"الصف الأول الابتدائي",    en:"Primary 1",  group:"primary", icon:"P1", order:11 },
  { id:"p2", ar:"الصف الثاني الابتدائي",   en:"Primary 2",  group:"primary", icon:"P2", order:12 },
  { id:"p3", ar:"الصف الثالث الابتدائي",   en:"Primary 3",  group:"primary", icon:"P3", order:13 },
  { id:"p4", ar:"الصف الرابع الابتدائي",   en:"Primary 4",  group:"primary", icon:"P4", order:14 },
  { id:"p5", ar:"الصف الخامس الابتدائي",   en:"Primary 5",  group:"primary", icon:"P5", order:15 },
  { id:"p6", ar:"الصف السادس الابتدائي",   en:"Primary 6",  group:"primary", icon:"P6", order:16 },

  { id:"prep1", ar:"الصف الأول الإعدادي",   en:"Prep 1", group:"prep", order:21, icon:"G7" },
  { id:"prep2", ar:"الصف الثاني الإعدادي",  en:"Prep 2", group:"prep", order:22, icon:"G8" },
  { id:"prep3", ar:"الصف الثالث الإعدادي",  en:"Prep 3", group:"prep", order:23, icon:"G9" },

  { id:"sec1", ar:"الصف الأول الثانوي",     en:"Secondary 1", group:"secondary", order:31, icon:"S1" },
  { id:"sec2", ar:"الصف الثاني الثانوي",    en:"Secondary 2", group:"secondary", order:32, icon:"S2" },
  { id:"sec3", ar:"الصف الثالث الثانوي",    en:"Secondary 3", group:"secondary", order:33, icon:"S3" },

  { id:"grammar",    ar:"القواعد",            en:"Grammar Lab",  group:"extra", order:41, icon:"GR" },
  { id:"exams",      ar:"بنك الامتحانات",     en:"Exam Bank",    group:"extra", order:42, icon:"EX" },
  { id:"smartboard", ar:"دروس السبورة الذكية", en:"Smartboard",  group:"extra", order:43, icon:"SB" }
];
