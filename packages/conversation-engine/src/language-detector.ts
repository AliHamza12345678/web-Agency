import type {
  DetectedLanguage,
  DetectedScript,
  LanguageDetectionResult,
} from './types.js';

// Unicode Regex ranges for script detection
const ARABIC_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const URDU_SPECIFIC_CHARS = /[ٹڈڑںےہھپچژگ]/g;
const DEVANAGARI_SCRIPT_REGEX = /[\u0900-\u097F]/g;
const LATIN_SCRIPT_REGEX = /[a-zA-Z]/g;
const CYRILLIC_SCRIPT_REGEX = /[\u0400-\u04FF]/g;
const CJK_SCRIPT_REGEX = /[\u4E00-\u9FFF]/g;

// Lexical markers for Roman Urdu (Latin transliterated Urdu)
const ROMAN_URDU_WORDS = new Set([
  // Pronouns
  'ap', 'aap', 'apka', 'apki', 'apke', 'hum', 'humein', 'humain', 'mera', 'meri', 'mere',
  'tum', 'tumhara', 'tumhari', 'tumhare', 'ye', 'yeh', 'wo', 'woh', 'inka', 'unka', 'kisi', 'sab', 'sub',
  // Question words
  'kya', 'kia', 'kyu', 'kyun', 'kyon', 'kaise', 'kese', 'kesy', 'kab', 'kahan', 'kidhar',
  'kitna', 'kitne', 'kitni', 'konsa', 'konsi', 'kon', 'kaun',
  // Copulas & auxiliaries
  'hai', 'hay', 'hain', 'hyn', 'hun', 'hoon', 'tha', 'thi', 'the', 'thay', 'hoga', 'hogi', 'honge', 'hongy',
  'raha', 'rahi', 'rahe', 'rh', 'rha', 'rhi',
  // Verbs & modals
  'batao', 'btao', 'bataen', 'bataiye', 'karo', 'karein', 'kren', 'krna', 'karna', 'kr', 'krr',
  'dekh', 'dekho', 'dekhein', 'chahiye', 'chahye', 'chahy', 'skta', 'sakta', 'sakti', 'sakty',
  'mil', 'milega', 'milay ga', 'milegi', 'lena', 'lo', 'dena', 'do', 'samajh', 'samjh',
  'aata', 'aati', 'hota', 'hoti', 'chalay', 'chale', 'chalta',
  // Prepositions & connectives
  'mein', 'me', 'men', 'se', 'sy', 'ko', 'ka', 'ki', 'ke', 'aur', 'or', 'ya', 'par', 'pe',
  'bhi', 'tak', 'lekin', 'magar', 'mgr', 'agar', 'agr', 'to', 'toh',
  // Common particles, adverbs & greetings
  'nahi', 'nhi', 'nahin', 'nahe', 'na', 'mat', 'acha', 'achha', 'achi', 'achay',
  'bohot', 'bht', 'bahut', 'theek', 'thik', 'shukriya', 'shukria', 'bhai', 'yar', 'yaar',
  'sahab', 'janab', 'wala', 'wali', 'wale', 'waly', 'zaroor', 'zaroorat', 'zarurat',
  'salam', 'assalam', 'aao', 'jao', 'karo', 'shuru', 'khtm', 'khatam', 'pesy', 'paise',
  'maal', 'kharab', 'theek', 'jaldi', 'dair', 'der', 'wapas', 'tabdeel'
]);

// Lexical markers for Hinglish distinct from typical Pakistani Roman Urdu
const HINGLISH_SPECIFIC_WORDS = new Set([
  'namaste', 'dhanyawad', 'kripya', 'shukriya', 'mujhko', 'tujhko', 'accha',
  'kripya', 'pata', 'hai na', 'samjhe', 'samjho'
]);

// English stop/function words
const ENGLISH_FUNCTION_WORDS = new Set([
  'the', 'is', 'are', 'was', 'were', 'and', 'or', 'to', 'in', 'on', 'at', 'by',
  'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'from', 'up', 'down', 'of', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
  'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
  'very', 'can', 'will', 'just', 'should', 'now', 'what', 'who', 'which', 'hello',
  'hi', 'hey', 'please', 'thanks', 'thank', 'you', 'your', 'my', 'mine', 'our',
  'their', 'his', 'her', 'its', 'i', 'we', 'they', 'he', 'she', 'it', 'me', 'us',
  'him', 'them', 'this', 'that', 'these', 'those', 'have', 'has', 'had', 'do',
  'does', 'did', 'would', 'could'
]);

/**
 * Normalizes input text and tokenizes into words.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Checks for explicit language-switch directives in visitor input.
 */
function checkExplicitSwitchDirective(text: string): {
  requested?: boolean;
  language?: DetectedLanguage;
  script?: DetectedScript;
} {
  const lower = text.toLowerCase();

  // Switch to Roman Urdu
  if (
    /(roman\s*urdu|roman\s*me|latin\s*urdu|english\s*urdu)/i.test(lower) &&
    /(bolo|baat|likho|reply|answer|speak|please|plz)/i.test(lower)
  ) {
    return { requested: true, language: 'roman-ur', script: 'latin' };
  }

  // Switch to Urdu script
  if (
    /(urdu\s*script|urdu\s*rasmulkhat|اردو\s*میں|urdu\s*mein\s*likho|urdu\s*me\s*bolo|speak\s*in\s*urdu|reply\s*in\s*urdu)/i.test(lower)
  ) {
    // If they typed in Urdu script or explicitly asked for Urdu
    return { requested: true, language: 'ur', script: 'arabic' };
  }

  // Switch to English
  if (
    /(speak\s*in\s*english|reply\s*in\s*english|in\s*english\s*please|english\s*me\s*bolo|english\s*please)/i.test(lower)
  ) {
    return { requested: true, language: 'en', script: 'latin' };
  }

  // Switch to Hindi / Hinglish
  if (/(hindi\s*mein|hinglish\s*mein|speak\s*in\s*hindi)/i.test(lower)) {
    return { requested: true, language: 'hi', script: 'devanagari' };
  }

  return { requested: false };
}

/**
 * Detects the language, script, code-switching, and intent of a visitor's message.
 */
export function detectLanguageAndScript(text: string): LanguageDetectionResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      language: 'en',
      script: 'latin',
      confidence: 1.0,
      isCodeSwitching: false,
      codeSwitchLanguages: ['en'],
      explicitSwitchRequested: false,
      explanation: 'Empty text defaults to English/Latin.',
    };
  }

  // 1. Check for explicit switch commands
  const explicit = checkExplicitSwitchDirective(trimmed);

  // 2. Count Unicode script characters
  const arabicMatches = trimmed.match(ARABIC_SCRIPT_REGEX) || [];
  const devanagariMatches = trimmed.match(DEVANAGARI_SCRIPT_REGEX) || [];
  const latinMatches = trimmed.match(LATIN_SCRIPT_REGEX) || [];
  const cyrillicMatches = trimmed.match(CYRILLIC_SCRIPT_REGEX) || [];
  const cjkMatches = trimmed.match(CJK_SCRIPT_REGEX) || [];

  const arabicCount = arabicMatches.length;
  const devanagariCount = devanagariMatches.length;
  const latinCount = latinMatches.length;
  const cyrillicCount = cyrillicMatches.length;
  const cjkCount = cjkMatches.length;

  // 3. Primary Script Resolution
  if (arabicCount > 0 && arabicCount >= latinCount && arabicCount >= devanagariCount) {
    const urduSpecific = (trimmed.match(URDU_SPECIFIC_CHARS) || []).length;
    const isUrdu = urduSpecific > 0 || /ہے|ہیں|کی|کے|کا|اور|میں|کیا|کو|سے|تھا|تھی/.test(trimmed);

    const lang: DetectedLanguage = isUrdu ? 'ur' : 'ar';
    const isCodeSwitch = latinCount > 3;

    return {
      language: lang,
      script: 'arabic',
      confidence: 0.95,
      isCodeSwitching: isCodeSwitch,
      codeSwitchLanguages: isCodeSwitch ? [lang, 'en'] : [lang],
      explicitSwitchRequested: !!explicit.requested,
      requestedLanguage: explicit.language,
      requestedScript: explicit.script,
      explanation: `Detected Arabic script (${lang === 'ur' ? 'Urdu' : 'Arabic'}).${isCodeSwitch ? ' Contains Latin code-switching.' : ''}`,
    };
  }

  if (devanagariCount > 0 && devanagariCount >= latinCount) {
    return {
      language: 'hi',
      script: 'devanagari',
      confidence: 0.95,
      isCodeSwitching: latinCount > 3,
      codeSwitchLanguages: latinCount > 3 ? ['hi', 'en'] : ['hi'],
      explicitSwitchRequested: !!explicit.requested,
      requestedLanguage: explicit.language,
      requestedScript: explicit.script,
      explanation: 'Detected Devanagari script (Hindi).',
    };
  }

  if (cjkCount > 0 && cjkCount >= latinCount) {
    return {
      language: 'other',
      script: 'cjk',
      confidence: 0.9,
      isCodeSwitching: false,
      codeSwitchLanguages: ['other'],
      explicitSwitchRequested: !!explicit.requested,
      requestedLanguage: explicit.language,
      requestedScript: explicit.script,
      explanation: 'Detected CJK characters.',
    };
  }

  if (cyrillicCount > 0 && cyrillicCount >= latinCount) {
    return {
      language: 'other',
      script: 'cyrillic',
      confidence: 0.9,
      isCodeSwitching: false,
      codeSwitchLanguages: ['other'],
      explicitSwitchRequested: !!explicit.requested,
      requestedLanguage: explicit.language,
      requestedScript: explicit.script,
      explanation: 'Detected Cyrillic script.',
    };
  }

// Homographs that exist in both English and Roman Urdu transliteration
const ENGLISH_URDU_HOMOGRAPHS = new Set(['the', 'to', 'me', 'or', 'do', 'so', 'is', 'in', 'on', 'no', 'as']);

  // 4. Latin Script Processing (English vs Roman Urdu vs Hinglish vs European languages)
  const tokens = tokenize(trimmed);
  let unambiguousRomanUrduHits = 0;
  let homographHits = 0;
  let englishHits = 0;
  let hinglishHits = 0;

  for (const token of tokens) {
    if (ROMAN_URDU_WORDS.has(token)) {
      if (ENGLISH_URDU_HOMOGRAPHS.has(token)) {
        homographHits++;
      } else {
        unambiguousRomanUrduHits++;
      }
    }
    if (ENGLISH_FUNCTION_WORDS.has(token)) {
      englishHits++;
    }
    if (HINGLISH_SPECIFIC_WORDS.has(token)) {
      hinglishHits++;
    }
  }

  // Homographs count towards Roman Urdu only if there is at least one unambiguous Roman Urdu marker
  const romanUrduHits = unambiguousRomanUrduHits > 0
    ? unambiguousRomanUrduHits + homographHits
    : 0;

  const totalTokens = tokens.length || 1;
  const romanUrduRatio = romanUrduHits / totalTokens;
  const englishRatio = englishHits / totalTokens;

  // Single or two-token short queries:
  // e.g., "kab?", "kitna?", "kyun?", "batao", "chalega?" -> Roman Urdu
  if (totalTokens <= 2 && (unambiguousRomanUrduHits > 0 || romanUrduHits > 0)) {
    return {
      language: 'roman-ur',
      script: 'latin',
      confidence: 0.9,
      isCodeSwitching: false,
      codeSwitchLanguages: ['roman-ur'],
      explicitSwitchRequested: !!explicit.requested,
      requestedLanguage: explicit.language,
      requestedScript: explicit.script,
      explanation: 'Short token matched distinct Roman Urdu marker.',
    };
  }

  // Roman Urdu Classification:
  // Requires at least one unambiguous Roman Urdu word AND either more Roman Urdu hits than English
  // or a meaningful Roman Urdu ratio.
  if (
    unambiguousRomanUrduHits >= 1 &&
    (romanUrduHits >= englishHits || romanUrduRatio >= 0.25 || englishHits <= 1)
  ) {
    const hasEnglishVocab = englishHits > 0 || (totalTokens - romanUrduHits >= 2);
    return {
      language: 'roman-ur',
      script: 'latin',
      confidence: Math.min(0.98, 0.6 + romanUrduRatio * 0.4),
      isCodeSwitching: hasEnglishVocab,
      codeSwitchLanguages: hasEnglishVocab ? ['roman-ur', 'en'] : ['roman-ur'],
      explicitSwitchRequested: !!explicit.requested,
      requestedLanguage: explicit.language,
      requestedScript: explicit.script,
      explanation: `Latin script with ${romanUrduHits} Roman Urdu markers (${Math.round(romanUrduRatio * 100)}%).`,
    };
  }

  if (hinglishHits >= 2 && hinglishHits >= englishHits) {
    return {
      language: 'hinglish',
      script: 'latin',
      confidence: 0.85,
      isCodeSwitching: true,
      codeSwitchLanguages: ['hinglish', 'en'],
      explicitSwitchRequested: !!explicit.requested,
      requestedLanguage: explicit.language,
      requestedScript: explicit.script,
      explanation: 'Latin script with Hinglish markers.',
    };
  }

  // European language checks (Spanish, French)
  const isSpanish = /\b(hola|por favor|gracias|buenos|dias|como|donde|cuando|precio)\b/i.test(trimmed);
  if (isSpanish && englishHits === 0) {
    return {
      language: 'es',
      script: 'latin',
      confidence: 0.9,
      isCodeSwitching: false,
      codeSwitchLanguages: ['es'],
      explicitSwitchRequested: !!explicit.requested,
      requestedLanguage: explicit.language,
      requestedScript: explicit.script,
      explanation: 'Detected Spanish lexical tokens.',
    };
  }

  const isFrench = /\b(bonjour|merci|s'il vous plait|combien|ou|quand|prix)\b/i.test(trimmed);
  if (isFrench && englishHits === 0) {
    return {
      language: 'fr',
      script: 'latin',
      confidence: 0.9,
      isCodeSwitching: false,
      codeSwitchLanguages: ['fr'],
      explicitSwitchRequested: !!explicit.requested,
      requestedLanguage: explicit.language,
      requestedScript: explicit.script,
      explanation: 'Detected French lexical tokens.',
    };
  }

  // Default to English Latin
  return {
    language: 'en',
    script: 'latin',
    confidence: Math.max(0.7, Math.min(0.98, 0.5 + englishRatio * 0.5)),
    isCodeSwitching: romanUrduHits > 0,
    codeSwitchLanguages: romanUrduHits > 0 ? ['en', 'roman-ur'] : ['en'],
    explicitSwitchRequested: !!explicit.requested,
    requestedLanguage: explicit.language,
    requestedScript: explicit.script,
    explanation: 'Latin script resolved to English.',
  };
}
