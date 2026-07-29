/**
 * JetBot knowledge base — pattern-matched FAQs (no LLM).
 * Add entries here to scale coverage; each pattern is checked in order.
 */

const FORM_LABELS = {
  preMedical: "Pre Medical",
  postMedical: "Post Medical",
  eyeExam: "Eye Exam",
  form33: "Form 33 (Certificate of Fitness)",
  healthRegister: "Health Register (Form 32)",
  xrayReport: "X-Ray Report",
  "4-form-airport-bohw": "Airport BOHW",
  "5-form-height-pass": "Height Pass",
  "35-form-airport-bohw-ht-front": "Airport BOHW HT Front",
  "36-form-airport-bohw-ht-back": "Airport BOHW HT Back",
  "11-form-audiometry-front": "Audiometry Front",
  "12-form-audiometry-back": "Audiometry Back",
  "13-form-pft-front": "PFT Front",
  "14-form-pft-back": "PFT Back",
  "15-form-vaccination-front": "Vaccination Front",
  "16-form-vaccination-back": "Vaccination Back",
  "17-form-food-handler-certificate": "Food Handler Certificate",
  "19-form-ecg": "ECG",
  "25-form-for-medical-fitness-certificate-format": "Fitness Certificate",
  "26-form-death-certificate": "Death Certificate",
  "10-form-ophthal-form-6": "Ophthal Form 6"
};

function rx(s) {
  return new RegExp(s, "i");
}

/** Core static FAQs — meta, help, clinic, how-to */
const STATIC_FAQS = [
  {
    id: "who_are_you",
    patterns: [
      rx("who are you"),
      rx("what are you"),
      rx("who is this"),
      rx("what is this bot"),
      rx("what is jetbot"),
      rx("who is jetbot"),
      rx("tum kaun"),
      rx("tu kaun"),
      rx("aap kaun"),
      rx("tame kon"),
      rx("tu kon"),
      rx("aa shu chhe"),
      rx("ye kya hai"),
      rx("what is this assistant"),
      rx("clinic assistant"),
      rx("are you ai"),
      rx("are you robot"),
      rx("are you human")
    ],
    answer: {
      en: "👋 I'm *JetBot* — your *DRSVL Clinic Assistant*. I answer questions about patients, forms, and reports in *English, Hindi, and Gujarati*. I use the live clinic database (not ChatGPT).",
      hi: "👋 मैं *JetBot* हूँ — आपका *DRSVL क्लिनिक असिस्टेंट*. मैं मरीज़, फॉर्म और रिपोर्ट के सवाल *अंग्रेज़ी, हिंदी और गुजराती* में जवाब देता/देती हूँ। मैं लाइव क्लिनिक डेटाबेस से जानकारी देता/देती हूँ।",
      gu: "👋 હું *JetBot* — તમારો *DRSVL ક્લિનિક અસિસ્ટન્ટ*. હું દર્દી, ફોર્મ અને રિપોર્ટના પ્રશ્નો *અંગ્રેજી, હિંદી અને ગુજરાતી* માં જવાબ આપું. હું લાઇવ ક્લિનિક ડેટાબેઝથી માહિતી આપું."
    }
  },
  {
    id: "who_made_you",
    patterns: [
      rx("who made you"),
      rx("who made this"),
      rx("who created you"),
      rx("who developed"),
      rx("who built"),
      rx("developer"),
      rx("who is the developer"),
      rx("kisne banaya"),
      rx("kisne banai"),
      rx("kon banavyu"),
      rx("banaya kaun"),
      rx("made by whom"),
      rx("your creator")
    ],
    answer: {
      en: "🛠️ *JetBot* is part of the *DRSVL / Aster Medcare* health-checkup system, built for the Adani site clinic. The platform was developed for *Dr. Sajan Limbachiya* and clinic operations — hardcoded assistant + secure patient database (no external AI).",
      hi: "🛠️ *JetBot* *DRSVL / Aster Medcare* स्वास्थ्य जाँच सिस्टम का हिस्सा है (Adani साइट क्लिनिक). यह *Dr. Sajan Limbachiya* और क्लिनिक संचालन के लिए बनाया गया — हार्डकोडेड असिस्टेंट + सुरक्षित मरीज़ डेटाबेस (बाहरी AI नहीं).",
      gu: "🛠️ *JetBot* *DRSVL / Aster Medcare* હેલ્થ ચેકઅપ સિસ્ટમનો ભાગ છે (Adani સાઇટ ક્લિનિક). *Dr. Sajan Limbachiya* અને ક્લિનિક ઓપરેશન માટે બનાવ્યું — હાર્ડકોડેડ અસિસ્ટન્ટ + સુરક્ષિત દર્દી ડેટાબેઝ (બાહ્ય AI નહીં)."
    }
  },
  {
    id: "what_can_you_do",
    patterns: [
      rx("what can you do"),
      rx("help me"),
      rx("help"),
      rx("commands"),
      rx("how to use"),
      rx("what questions"),
      rx("kya kar sakte"),
      rx("kya kar sakti"),
      rx("shu kar shakay"),
      rx("shu kari shakay"),
      rx("features"),
      rx("capabilities"),
      rx("menu"),
      rx("options"),
      rx("show help"),
      rx("guide")
    ],
    answer: {
      en: "📋 *I can help with:*\n• Total patients / by gender / by company\n• Find patient — *PT-2026-XXXX*, name, mobile, employee code\n• FIT / UNFIT counts (Form 33)\n• List companies\n• Pending forms — \"who hasn't done form 33?\"\n• Explain patient IDs & forms\n\n*Try:*\n• How many from ADANI?\n• Find Ramesh Patel\n• PT-2026-1292\n• Kitne fit hain?\n• Whose ID is this? *(after a lookup)*",
      hi: "📋 *मैं यह कर सकता/सकती हूँ:*\n• कुल मरीज़ / लिंग / कंपनी के हिसाब से\n• मरीज़ खोजें — *PT-2026-XXXX*, नाम, मोबाइल, employee code\n• FIT / UNFIT (Form 33)\n• कंपनियों की सूची\n• बाकी फॉर्म — \"form 33 किसने नहीं भरा?\"\n• ID और फॉर्म की जानकारी\n\n*उदाहरण:* ADANI mein kitne? · Ramesh Patel kaun hai? · Kitne fit hain?",
      gu: "📋 *હું આ કરી શકું:*\n• કુલ દર્દી / લિંગ / કંપની\n• દર્દી શોધ — *PT-2026-XXXX*, નામ, મોબાઇલ, employee code\n• FIT / UNFIT (Form 33)\n• કંપનીઓની યાદી\n• બાકી ફોર્મ — \"form 33 કોણે નથી ભર્યું?\"\n• ID અને ફોર્મ માહિતી\n\n*ઉદાહરણ:* ADANI ma ketla? · Ramesh Patel kon chhe? · Ketle fit chhe?"
    }
  },
  {
    id: "what_is_patient_id",
    patterns: [
      rx("what is patient id"),
      rx("what is pt-"),
      rx("patient id kya"),
      rx("patient id shu"),
      rx("what does pt mean"),
      rx("id format"),
      rx("pt id"),
      rx("which id is this"),
      rx("what is this id"),
      rx("ye id kya hai"),
      rx("aa id shu chhe"),
      rx("id ka matlab"),
      rx("id meaning")
    ],
    answer: {
      en: "🆔 A *Patient ID* looks like *PT-2026-1292* — unique clinic number for each worker.\n• *PT* = Patient\n• *2026* = registration year\n• *1292* = sequence number\n\nAsk: *PT-2026-1292* or \"Find Ramesh Patel\" to look someone up.",
      hi: "🆔 *Patient ID* जैसे *PT-2026-1292* — हर worker का अद्वितीय क्लिनिक नंबर।\n• *PT* = Patient\n• *2026* = पंजीकरण वर्ष\n• *1292* = क्रम संख्या\n\nपूछें: *PT-2026-1292* या \"Ramesh Patel kaun hai?\"",
      gu: "🆔 *Patient ID* જેમ કે *PT-2026-1292* — દરેક worker નો યુનિક ક્લિનિક નંબર.\n• *PT* = Patient\n• *2026* = નોંધણી વર્ષ\n• *1292* = ક્રમ નંબર\n\nપૂછો: *PT-2026-1292* અથવા \"Ramesh Patel kon chhe?\""
    }
  },
  {
    id: "what_is_employee_code",
    patterns: [
      rx("what is employee code"),
      rx("what is emp code"),
      rx("employee code kya"),
      rx("emp id kya"),
      rx("emp code shu"),
      rx("employee id meaning"),
      rx("company employee number")
    ],
    answer: {
      en: "🏷️ *Employee Code* is the worker's company ID (often 6–10 digits from HR/Excel import).\nSearch: *emp 10187398* or just type the number.\nIt links the medical record to the employer roster.",
      hi: "🏷️ *Employee Code* कंपनी का worker ID (अक्सर 6–10 अंक, HR/Excel से).\nखोजें: *emp 10187398* या सीधे नंबर टाइप करें।\nयह मेडिकल रिकॉर्ड को employer रोस्टर से जोड़ता है।",
      gu: "🏷️ *Employee Code* કંપનીનો worker ID (સામાન્ય રીતે 6–10 અંક, HR/Excel થી).\nશોધો: *emp 10187398* અથવા સીધો નંબર ટાઇપ કરો.\nતે મેડિકલ રેકોર્ડ employer રોસ્ટર સાથે જોડે છે."
    }
  },
  {
    id: "what_is_drsvl",
    patterns: [
      rx("what is drsvl"),
      rx("drsvl kya hai"),
      rx("drsvl shu chhe"),
      rx("what is this system"),
      rx("what is this app"),
      rx("what is aster medcare"),
      rx("aster medcare"),
      rx("about this software")
    ],
    answer: {
      en: "🏥 *DRSVL* is the clinic workspace for *Aster Medcare* (Adani Excellent Center site).\nIt registers workers, fills medical forms (Form 33, Health Register, BOHW, etc.), and exports PDF dossiers for occupational health compliance.",
      hi: "🏥 *DRSVL* *Aster Medcare* (Adani Excellent Center) का क्लिनिक वर्कस्पेस है।\nWorker पंजीकरण, मेडिकल फॉर्म (Form 33, Health Register, BOHW, आदि), और PDF export — occupational health के लिए।",
      gu: "🏥 *DRSVL* *Aster Medcare* (Adani Excellent Center) નો ક્લિનિક વર્કસ્પેસ છે.\nWorker નોંધણી, મેડિકલ ફોર્મ (Form 33, Health Register, BOHW, વગેરે), અને PDF export — occupational health માટે."
    }
  },
  {
    id: "how_many_forms",
    patterns: [
      rx("how many forms"),
      rx("list forms"),
      rx("which forms"),
      rx("all forms"),
      rx("kitne form"),
      rx("ketla form"),
      rx("form list"),
      rx("available forms")
    ],
    answer: {
      en: "📄 The system has *22+ medical forms*, including:\nPre/Post Medical, Eye Exam, *Form 33*, *Health Register*, X-Ray, Airport BOHW, Height Pass, Audiometry, PFT, Vaccination, ECG, Fitness Certificate, Food Handler, and more.\nAsk: *What is Form 33?* or *Pending form 33*",
      hi: "📄 सिस्टम में *22+ मेडिकल फॉर्म* हैं:\nPre/Post Medical, Eye Exam, *Form 33*, *Health Register*, X-Ray, BOHW, Height Pass, Audiometry, PFT, Vaccination, ECG, आदि।\nपूछें: *Form 33 kya hai?* या *Pending form 33*",
      gu: "📄 સિસ્ટમમાં *22+ મેડિકલ ફોર્મ*:\nPre/Post Medical, Eye Exam, *Form 33*, *Health Register*, X-Ray, BOHW, Height Pass, Audiometry, PFT, Vaccination, ECG, વગેરે.\nપૂછો: *Form 33 shu chhe?* અથવા *Pending form 33*"
    }
  },
  {
    id: "what_is_fit",
    patterns: [
      rx("what is fit"),
      rx("what is unfit"),
      rx("fit unfit meaning"),
      rx("fit kya hai"),
      rx("unfit kya hai"),
      rx("fit shu chhe"),
      rx("certificate of fitness")
    ],
    answer: {
      en: "✅ *FIT* on *Form 33* means the worker is medically fit for hazardous/dangerous work.\n❌ *UNFIT* means not fit — may need restrictions or re-examination.\nAsk: *How many fit?* or *Kitne unfit hain?*",
      hi: "✅ *FIT* (*Form 33*) = worker खतरनाक/जोखिम भरे काम के लिए चिकित्सकीय योग्य।\n❌ *UNFIT* = योग्य नहीं — प्रतिबंध या पुनः जाँच।\nपूछें: *Kitne fit hain?*",
      gu: "✅ *FIT* (*Form 33*) = worker ખતરનાક કામ માટે તબીબી યોગ્ય.\n❌ *UNFIT* = યોગ્ય નહીં — પ્રતિબંધ અથવા ફરી તપાસ.\nપૂછો: *Ketle fit chhe?*"
    }
  },
  {
    id: "how_register_patient",
    patterns: [
      rx("how to register"),
      rx("add patient"),
      rx("new patient"),
      rx("register patient"),
      rx("patient kaise add"),
      rx("naya patient"),
      rx("patient kem add")
    ],
    answer: {
      en: "➕ Go to *Patients List* → *Register Patient* (or */patients/new*).\nFill name, age, gender, company, employee code, mobile, then save. A new *PT-YYYY-XXXX* ID is created automatically.",
      hi: "➕ *Patients List* → *Register Patient* पर जाएँ।\nनाम, उम्र, लिंग, कंपनी, employee code, mobile भरें — नया *PT-YYYY-XXXX* ID अपने आप बनता है।",
      gu: "➕ *Patients List* → *Register Patient* પર જાઓ.\nનામ, ઉંમર, લિંગ, કંપની, employee code, mobile ભરો — નવું *PT-YYYY-XXXX* ID આપમેળે બનશે."
    }
  },
  {
    id: "how_bulk_export",
    patterns: [
      rx("bulk export"),
      rx("download pdf"),
      rx("zip export"),
      rx("merged pdf"),
      rx("how to export"),
      rx("bulk download"),
      rx("pdf kaise download")
    ],
    answer: {
      en: "📦 *Bulk export:* Patients List → select patients → choose forms → *ZIP* (one PDF per patient) or *Single merged PDF*.\nAdmin Panel also has bulk export. Forms can include blanks for handwriting.",
      hi: "📦 *Bulk export:* Patients List → मरीज़ चुनें → फॉर्म चुनें → *ZIP* या *Single PDF*.\nAdmin Panel में भी export है।",
      gu: "📦 *Bulk export:* Patients List → દર્દી પસંદ કરો → ફોર્મ → *ZIP* અથવા *Single PDF*.\nAdmin Panel માં પણ export છે."
    }
  },
  {
    id: "how_login",
    patterns: [
      rx("how to login"),
      rx("how to sign in"),
      rx("login kaise"),
      rx("password reset"),
      rx("forgot password"),
      rx("cant login"),
      rx("cannot login"),
      rx("login nahi ho raha"),
      rx("login nathi thatu")
    ],
    answer: {
      en: "🔐 Use your clinic email and password on the login page.\nPassword must be 10+ chars with upper, lower, number & symbol.\n*Forgot password?* Contact your *System Admin* — passwords are reset from Admin Panel only.",
      hi: "🔐 क्लिनिक ईमेल और पासवर्ड से लॉगिन करें।\nपासवर्ड: 10+ अक्षर, बड़ा/छोटा, नंबर, प्रतीक।\n*पासवर्ड भूल गए?* *System Admin* से संपर्क करें।",
      gu: "🔐 ક્લિનિક ઈમેલ અને પાસવર્ડથી લોગિન કરો.\nપાસવર્ડ: 10+ અક્ષર, મોટા/નાના, નંબર, ચિહ્ન.\n*પાસવર્ડ ભૂલ્યા?* *System Admin* નો સંપર્ક કરો."
    }
  },
  {
    id: "is_data_safe",
    patterns: [
      rx("is data safe"),
      rx("data secure"),
      rx("privacy"),
      rx("data protection"),
      rx("aadhaar safe"),
      rx("mobile safe"),
      rx("data surakshit")
    ],
    answer: {
      en: "🔒 Patient gov IDs are *encrypted* in the database. JetBot *masks mobile numbers* in replies. Access requires clinic login. Do not share patient PDFs on public links.",
      hi: "🔒 सरकारी ID *encrypted* हैं। JetBot मोबाइल *mask* करता है। क्लिनिक लॉगिन ज़रूरी। सार्वजनिक लिंक पर PDF न शेयर करें।",
      gu: "🔒 સરકારી ID *encrypted* છે. JetBot મોબાઇલ *mask* કરે છે. ક્લિનિક લોગિન જરૂરી. પબ્લિક લિંક પર PDF શેર ન કરો."
    }
  },
  {
    id: "greeting",
    patterns: [
      rx("^hi$"),
      rx("^hello$"),
      rx("^hey$"),
      rx("^namaste$"),
      rx("^good morning"),
      rx("^good evening"),
      rx("^good afternoon"),
      rx("kaise ho"),
      rx("kem cho"),
      rx("salam")
    ],
    answer: {
      en: "👋 Namaste! I'm *JetBot*. Ask me about patients, forms, FIT/UNFIT, or companies — in English, Hindi, or Gujarati!",
      hi: "👋 नमस्ते! मैं *JetBot* हूँ। मरीज़, फॉर्म, FIT/UNFIT, कंपनी — कुछ भी पूछें!",
      gu: "👋 નમસ્તે! હું *JetBot*. દર્દી, ફોર્મ, FIT/UNFIT, કંપની — કંઈ પણ પૂછો!"
    }
  },
  {
    id: "thanks",
    patterns: [
      rx("thank you"),
      rx("thanks"),
      rx("dhanyavad"),
      rx("shukriya"),
      rx("aabhar"),
      rx("appreciate")
    ],
    answer: {
      en: "😊 You're welcome! Ask anytime if you need patient or form info.",
      hi: "😊 स्वागत है! मरीज़ या फॉर्म की जानकारी चाहिए तो पूछें।",
      gu: "😊 આપનો આભાર! દર્દી અથવા ફોર્મ માહિતી જોઈએ તો પૂછો."
    }
  },
  {
    id: "goodbye",
    patterns: [
      rx("bye"),
      rx("goodbye"),
      rx("see you"),
      rx("alvida"),
      rx("chalo"),
      rx("close chat")
    ],
    answer: {
      en: "👋 Goodbye! I'll be here when you need clinic data.",
      hi: "👋 अलविदा! जरूरत पड़े तो मैं यहाँ हूँ।",
      gu: "👋 આવજો! જરૂર પડે તો હું અહીં છું."
    }
  },
  {
    id: "what_is_this",
    patterns: [
      rx("what is this"),
      rx("ye kya hai"),
      rx("aa shu chhe"),
      rx("explain this"),
      rx("meaning of this"),
      rx("what does this mean")
    ],
    answer: {
      en: "💡 If you mean a *Patient ID* — format is *PT-2026-XXXX*. If you just looked up someone, ask *\"Whose ID is this?\"* and I'll explain the last result.\nOtherwise try: *What is Form 33?* or *Help*",
      hi: "💡 अगर *Patient ID* — फॉर्मेट *PT-2026-XXXX*. अभी किसी को खोजा था तो पूछें *\"Ye ID kiska hai?\"*\nया: *Form 33 kya hai?* · *Help*",
      gu: "💡 *Patient ID* — ફોર્મેટ *PT-2026-XXXX*. હમણાં કોઈને શોધ્યા તો *\"Aa ID konu chhe?\"* પૂછો.\nઅથવા: *Form 33 shu chhe?* · *Help*"
    }
  }
];

/** Auto-generate per-form FAQ entries */
function buildFormFaqs() {
  const faqs = [];
  for (const [key, label] of Object.entries(FORM_LABELS)) {
    const slug = key.replace(/[^a-z0-9]/gi, " ");
    faqs.push({
      id: `form_${key}`,
      patterns: [
        rx(`what is ${label}`),
        rx(`what is ${key}`),
        rx(`${label}\\s*form`),
        rx(`${slug}\\s*kya`),
        rx(`${slug}\\s*shu`),
        rx(`about ${label}`),
        rx(`explain ${label}`),
        rx(`form ${key}`),
        rx(`form ${slug}`)
      ],
      answer: {
        en: `📋 *${label}*\n• System key: \`${key}\`\n• Part of the DRSVL occupational health dossier.\n• Ask: *Pending ${key}* to see who hasn't filled it.`,
        hi: `📋 *${label}*\n• सिस्टम key: \`${key}\`\n• DRSVL occupational health dossier का हिस्सा।\n• पूछें: *Pending ${key}* — किसने नहीं भरा।`,
        gu: `📋 *${label}*\n• સિસ્ટમ key: \`${key}\`\n• DRSVL occupational health dossier નો ભાગ.\n• પૂછો: *Pending ${key}* — કોણે નથી ભર્યું.`
      }
    });
  }
  return faqs;
}

/** Company-name hint FAQs (common site employers) */
const COMPANY_HINT_FAQS = [
  {
    id: "company_adani",
    patterns: [rx("what is adani"), rx("adani company"), rx("adani kya hai")],
    answer: {
      en: "🏢 *ADANI* workers are registered under various contractor companies on this site (e.g. C.L.R.F.S CARGO, AIRPORT units). Ask: *How many from ADANI?* or *List companies*",
      hi: "🏢 *ADANI* site पर विभिन्न contractor कंपनियों के worker हैं। पूछें: *ADANI mein kitne?* या *List companies*",
      gu: "🏢 *ADANI* સાઇટ પર વિવિધ contractor કંપનીઓના worker છે. પૂછો: *ADANI ma ketla?* અથવા *List companies*"
    }
  },
  {
    id: "company_cargo",
    patterns: [rx("what is cargo"), rx("clrf cargo"), rx("cargo company")],
    answer: {
      en: "🏢 *C.L.R.F.S (CARGO)* is a contractor company on the Adani site. Ask: *How many from CARGO?*",
      hi: "🏢 *C.L.R.F.S (CARGO)* Adani site पर contractor कंपनी। पूछें: *CARGO mein kitne?*",
      gu: "🏢 *C.L.R.F.S (CARGO)* Adani સાઇટ પર contractor કંપની. પૂછો: *CARGO ma ketla?*"
    }
  }
];

function patternsFromPhrases(phrases) {
  return phrases.map((p) => rx(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

/** Hundreds of phrasing variants merged into FAQ pattern lists */
function expandMetaPatterns() {
  const whoPhrases = [
    "who are you", "what are you", "who is this", "what is this bot", "what is jetbot",
    "who is jetbot", "tell me about yourself", "introduce yourself", "your name",
    "tum kaun ho", "tu kaun hai", "aap kaun hain", "tame kon chho", "tu kon chhe",
    "aa shu chhe", "ye bot kya hai", "kon chhe aa", "identify yourself",
    "are you real", "are you ai", "are you chatgpt", "robot hai kya"
  ];
  const madePhrases = [
    "who made you", "who made this", "who created you", "who developed this app",
    "who built this", "who is developer", "developer name", "creator of this",
    "kisne banaya", "kisne banai", "kon banavyu", "banaya kaun hai",
    "made by whom", "who designed drsvl", "who made drsvl", "software banaya kaun"
  ];
  const helpPhrases = [
    "help", "help me", "what can you do", "commands", "how to use you",
    "show commands", "what questions can i ask", "examples", "suggestions",
    "kya kar sakte ho", "kya kar sakti ho", "kaise use kare", "guide me",
    "shu kar shakay", "shu kari shakay", "mari help karo", "menu options"
  ];

  const byId = Object.fromEntries(STATIC_FAQS.map((f) => [f.id, f]));
  byId.who_are_you.patterns.push(...patternsFromPhrases(whoPhrases));
  byId.who_made_you.patterns.push(...patternsFromPhrases(madePhrases));
  byId.what_can_you_do.patterns.push(...patternsFromPhrases(helpPhrases));
}

expandMetaPatterns();

const ALL_FAQS = [...STATIC_FAQS, ...buildFormFaqs(), ...COMPANY_HINT_FAQS];

function normalizeForMatch(msg) {
  return String(msg).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Match message against knowledge base (first pattern win, ordered list).
 */
function matchKnowledge(message) {
  const m = String(message).trim();
  for (const entry of ALL_FAQS) {
    for (const pattern of entry.patterns) {
      if (pattern.test(m)) {
        return entry;
      }
    }
  }
  return null;
}

function getKnowledgeAnswer(entry, lang) {
  if (!entry?.answer) return null;
  return entry.answer[lang] || entry.answer.en;
}

module.exports = {
  FORM_LABELS,
  ALL_FAQS,
  matchKnowledge,
  getKnowledgeAnswer,
  normalizeForMatch
};
