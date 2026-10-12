/**
 * Adversarial Input Inspection & Defense Utility
 * Detects direct and indirect prompt injection attempts, system prompt exfiltration,
 * and jailbreak attempts without relying on LLM self-assessment.
 */

export interface AdversarialCheckResult {
  isSuspicious: boolean;
  score: number; // 0 to 1
  flags: string[];
}

const INJECTION_PATTERNS: Array<{ pattern: RegExp; flag: string; weight: number }> = [
  // Direct jailbreak & instruction override
  { pattern: /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|directives|rules)/i, flag: 'instruction_override', weight: 0.9 },
  { pattern: /disregard\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/i, flag: 'instruction_override', weight: 0.9 },
  { pattern: /\b(dan\s+mode|jailbreak|developer\s+mode\s+enabled)\b/i, flag: 'jailbreak_signature', weight: 0.95 },
  { pattern: /you\s+are\s+no\s+longer\s+(an\s+ai|restricted|bound\s+by)/i, flag: 'persona_hijack', weight: 0.85 },
  { pattern: /pretend\s+you\s+have\s+no\s+(safety|rules|filters|boundaries)/i, flag: 'safety_bypass', weight: 0.85 },

  // System prompt exfiltration & secret leakage
  { pattern: /(print|show|repeat|display|output|reveal)\s+(your\s+)?(initial\s+)?(system\s+prompt|initial\s+prompt|system\s+instructions|system\s+directive)/i, flag: 'prompt_exfiltration', weight: 0.9 },
  { pattern: /what\s+(are\s+your|is\s+your)\s+(hidden|internal|system)\s+(instructions|prompts|rules)/i, flag: 'prompt_exfiltration', weight: 0.85 },
  { pattern: /output\s+everything\s+(above|before\s+this)/i, flag: 'prompt_exfiltration', weight: 0.8 },
  { pattern: /(print|reveal|show)\s+(the\s+)?(api_key|jwt_secret|database_url|admin_password)/i, flag: 'secret_probe', weight: 0.95 },

  // Roleplay / Elevated privilege injection
  { pattern: /roleplay\s+as\s+(root|superuser|administrator|system\s+engineer)/i, flag: 'privilege_escalation', weight: 0.75 },
  { pattern: /sudo\s+|admin_mode\s*=\s*true/i, flag: 'privilege_escalation', weight: 0.7 },

  // Cross-tenant probing
  { pattern: /(access|switch\s+to|retrieve\s+from)\s+(other|another)\s+(tenant|site|customer)/i, flag: 'cross_tenant_probe', weight: 0.8 },
];

/**
 * Deterministically inspect input string for adversarial intent.
 */
export function inspectAdversarialInput(input: string): AdversarialCheckResult {
  if (!input || typeof input !== 'string') {
    return { isSuspicious: false, score: 0, flags: [] };
  }

  const normalized = input.trim();
  const matchedFlags: string[] = [];
  let maxWeight = 0;

  for (const { pattern, flag, weight } of INJECTION_PATTERNS) {
    if (pattern.test(normalized)) {
      matchedFlags.push(flag);
      if (weight > maxWeight) {
        maxWeight = weight;
      }
    }
  }

  return {
    isSuspicious: matchedFlags.length > 0 && maxWeight >= 0.7,
    score: maxWeight,
    flags: Array.from(new Set(matchedFlags)),
  };
}

/**
 * Neutralizes prompt delimiter boundary breaking (e.g. triple quotes or fake system headers)
 */
export function neutralizePromptBoundaries(text: string): string {
  if (!text) return '';
  return text
    .replace(/"""/g, "'''")
    .replace(/<system>/gi, '&lt;system&gt;')
    .replace(/<\/system>/gi, '&lt;/system&gt;')
    .replace(/<verified_site_knowledge>/gi, '&lt;verified_site_knowledge&gt;')
    .replace(/<\/verified_site_knowledge>/gi, '&lt;/verified_site_knowledge&gt;');
}
