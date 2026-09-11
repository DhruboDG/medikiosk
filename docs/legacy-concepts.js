/* Extracted from medikiosk-mvp_5.html (earlier prototype).
   Reference material for the packet 1 port. Not imported by the app. */

/* Devanagari needs its own normalisation. Chandrabindu and anusvara are
   used interchangeably by speakers and recognisers (साँस vs सांस), and
   nukta is inconsistently applied, so both are folded away. */
function normalizeText(s){
  return String(s || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[‌‍]/g, "")   // zero-width joiners
    .replace(/ँ/g, "ं")     // ँ -> ं
    .replace(/़/g, "")           // nukta
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CONCEPTS = {
  chest_pain: { label: { en: "Chest pain", hi: "सीने में दर्द" }, forms: [
    "chest pain","pain in chest","chest pressure","pressure in chest","tightness in chest",
    "chest discomfort","angina","chest tightness","heaviness in chest",
    "सीने में दर्द","सीने मे दर्द","छाती में दर्द","छाती दर्द","सीने में जकड़न","सीने में दबाव","सीने में भारीपन",
    "seene mein dard","seene me dard","sine mein dard","chhati mein dard","chati dard","chest mein dard"
  ]},
  breathlessness: { label: { en: "Breathlessness", hi: "साँस की तकलीफ" }, forms: [
    "shortness of breath","short of breath","difficulty breathing","difficulty in breathing",
    "breathless","cannot breathe","can not breathe","trouble breathing","wheezing","suffocating","asthma",
    "सांस","सांस लेने में","सांस फूल","दम घुट","सांस की तकलीफ","सांस नहीं आ","दमा","हांफ",
    "saans","sans","saans lene mein","saans phool","dam ghut","haanf","damaa"
  ]},
  abdominal_pain: { label: { en: "Abdominal pain", hi: "पेट दर्द" }, forms: [
    "stomach pain","stomach ache","abdomen","abdominal","belly pain","tummy","cramp","stomach",
    "पेट में दर्द","पेट दर्द","पेट में","पेट की","मरोड़","ऐंठन",
    "pet dard","pet mein dard","pet me dard","pait dard","maror"
  ]},
  fever: { label: { en: "Fever", hi: "बुखार" }, forms: [
    "fever","high temperature","temperature","chills","feverish",
    "बुखार","ज्वर","तेज बुखार","ठंड लग","कंपकंपी",
    "bukhar","bukhaar","jwar","thand lag","kapkapi"
  ]},
  cough: { label: { en: "Cough", hi: "खांसी" }, forms: [
    "cough","coughing","dry cough",
    "खांसी","खासी","सूखी खांसी",
    "khansi","khaansi","khasi"
  ]},
  heart_attack: { label: { en: "Suspected heart attack", hi: "दिल का दौरा" }, forms: [
    "heart attack","cardiac arrest","myocardial",
    "दिल का दौरा","हार्ट अटैक","दिल की धड़कन बंद",
    "dil ka daura","dil ka dora"
  ]},
  unconscious: { label: { en: "Unconscious", hi: "बेहोशी" }, forms: [
    "unconscious","fainted","passed out","not responding","collapsed",
    "बेहोश","बेहोशी","होश नहीं","गिर पड़",
    "behosh","behoshi","hosh nahi"
  ]},
  stroke: { label: { en: "Stroke signs", hi: "लकवा" }, forms: [
    "stroke","face drooping","slurred speech","weakness on one side","paralysis",
    "लकवा","पक्षाघात","मुंह टेढ़ा","एक तरफ कमजोरी","बोलने में लड़खड़",
    "lakwa","lakva","pakshaghat"
  ]},
  bleeding: { label: { en: "Heavy bleeding", hi: "अधिक रक्तस्राव" }, forms: [
    "heavy bleeding","bleeding a lot","lot of blood","haemorrhage","hemorrhage",
    "खून बह","बहुत खून","खून निकल","रक्तस्राव",
    "khoon beh","bahut khoon","khoon nikal"
  ]},
  coughing_blood: { label: { en: "Coughing blood", hi: "खांसी में खून" }, forms: [
    "coughing blood","blood in cough","cough with blood","haemoptysis",
    "खांसी में खून","खून की खांसी","बलगम में खून",
    "khansi mein khoon","balgam mein khoon"
  ]},
  choking: { label: { en: "Choking", hi: "गला घुटना" }, forms: [
    "choking","something stuck in throat",
    "गला घुट","गले में फंस","दम घुट",
    "gala ghut","gale mein phas"
  ]},
  severe_burn: { label: { en: "Severe burn", hi: "गंभीर जलन" }, forms: [
    "severe burn","burnt","burn injury","scalded",
    "जल गया","जल गई","झुलस","गंभीर जलन",
    "jal gaya","jhulas"
  ]},
  /* answer-level concepts */
  unbearable: { label: { en: "Unbearable", hi: "असहनीय" }, forms: [
    "unbearable","cannot bear","worst pain","ten out of ten","severe",
    "असहनीय","बर्दाश्त नहीं","बहुत तेज","सहन नहीं",
    "asahniya","bardasht nahi","bahut tez"
  ]},
  cannot_speak: { label: { en: "Cannot complete a sentence", hi: "पूरा वाक्य नहीं बोल पा रहे" }, forms: [
    "cannot","can not","cant","unable","only few words","one word",
    "नहीं बोल","पूरा नहीं","रुक रुक",
    "nahi bol","ruk ruk"
  ]}
};
