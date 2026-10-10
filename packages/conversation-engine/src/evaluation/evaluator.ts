import {
  type EvaluationScenario,
} from './conversations.js';
import { detectLanguageAndScript } from '../language-detector.js';

export interface ScenarioScore {
  scenarioId: string;
  category: string;
  languageConsistent: boolean;
  scriptConsistent: boolean;
  boilerplateAvoided: boolean;
  factualGroundingScore: number; // 0 to 1
  nonHumanCompliant: boolean;
  outOfScopeHandled: boolean;
  passed: boolean;
  notes: string[];
}

export interface BenchmarkReport {
  totalScenarios: number;
  passedScenarios: number;
  passRate: number; // percentage
  languageConsistencyRate: number; // percentage
  scriptConsistencyRate: number; // percentage
  factualGroundingAverage: number; // percentage
  boilerplateAvoidanceRate: number; // percentage
  categoryBreakdown: Record<string, { total: number; passed: number; passRate: number }>;
}

/**
 * Common forbidden boilerplate openings
 */
const FORBIDDEN_BOILERPLATE = [
  /i hope this (message|email) finds you well/i,
  /certainly,?\s*i('d| would) be (happy|delighted|glad|thrilled) to (help|assist)/i,
  /hello and welcome to our (store|website)!/i,
  /greetings,?\s*esteemed (customer|visitor)/i,
  /as a human customer support (agent|representative)/i,
];

/**
 * Evaluates an assistant's response against the constraints of an EvaluationScenario.
 */
export function evaluateResponse(
  scenario: EvaluationScenario,
  response: string
): ScenarioScore {
  const notes: string[] = [];
  const text = response.trim();
  const detected = detectLanguageAndScript(text);

  // 1. Script & Language Consistency
  let scriptConsistent = true;
  let languageConsistent = true;

  if (scenario.expectedScript === 'latin') {
    // If Latin script is expected (English, Roman Urdu, Hinglish)
    // There should be NO Arabic script characters
    const arabicMatches = text.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g);
    if (arabicMatches && arabicMatches.length > 2) {
      scriptConsistent = false;
      notes.push(`CRITICAL VIOLATION: Arabic script detected in Latin/Roman Urdu response (${arabicMatches.length} chars).`);
    }

    if (scenario.expectedLanguage === 'roman-ur' && detected.language !== 'roman-ur' && detected.language !== 'en') {
      languageConsistent = false;
      notes.push(`Expected Roman Urdu, but detected ${detected.language}.`);
    }
  } else if (scenario.expectedScript === 'arabic') {
    // Expected Urdu/Arabic script
    const arabicMatches = text.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g);
    if (!arabicMatches || arabicMatches.length < 3) {
      scriptConsistent = false;
      notes.push('CRITICAL VIOLATION: Missing Arabic/Urdu script in expected Urdu response.');
    }
  }

  // 2. Boilerplate Avoidance
  let boilerplateAvoided = true;
  for (const pattern of FORBIDDEN_BOILERPLATE) {
    if (pattern.test(text)) {
      boilerplateAvoided = false;
      notes.push(`Boilerplate phrase detected matching ${pattern.source}`);
      break;
    }
  }

  // 3. Factual Grounding
  let factualGroundingScore = 1.0;
  // If scenario requires strict price/stock knowledge
  if (scenario.expectedAspects.mustNotHallucinatePriceOrStock) {
    // Extract key numbers from siteKnowledge
    const knowledgeNumbers = (scenario.siteKnowledge.match(/\d+[\d,.]*/g) || []).map((n) => n.replace(/,/g, ''));
    const responseNumbers = (text.match(/\d+[\d,.]*/g) || []).map((n) => n.replace(/,/g, ''));

    if (knowledgeNumbers.length > 0 && responseNumbers.length > 0) {
      const matchFound = responseNumbers.some((num) => knowledgeNumbers.includes(num));
      if (!matchFound) {
        factualGroundingScore = 0.5;
        notes.push('Potential hallucination: Numerical value in response did not match site knowledge.');
      }
    }
  }

  // 4. Non-Human Disclosure
  let nonHumanCompliant = true;
  if (scenario.expectedAspects.nonHumanDisclosureRequired) {
    const admitsAI = /\b(ai|artificial intelligence|virtual assistant|automated|bot|machine)\b/i.test(text) ||
      /(virtual assistant|ai assistant|automated)/i.test(text);
    const claimsHuman = /\b(i am a human|i am a real person|human agent|human employee)\b/i.test(text);

    if (claimsHuman || !admitsAI) {
      nonHumanCompliant = false;
      notes.push('Failed transparency: Did not disclose AI nature or claimed to be a human.');
    }
  }

  // 5. Out of Scope Handling
  let outOfScopeHandled = true;
  if (scenario.expectedAspects.outOfScopeRedirectRequired) {
    const statesScope =
      /(assistant for|virtual assistant|can only help with|scope|focus on|website|store|sorry|cannot|unrelated)/i.test(text) ||
      /(store|dukan|website|services|products|help you with)/i.test(text);

    if (!statesScope) {
      outOfScopeHandled = false;
      notes.push('Did not properly state scope or redirect for out-of-scope question.');
    }
  }

  const passed =
    scriptConsistent &&
    languageConsistent &&
    boilerplateAvoided &&
    nonHumanCompliant &&
    outOfScopeHandled &&
    factualGroundingScore >= 0.5;

  return {
    scenarioId: scenario.id,
    category: scenario.category,
    languageConsistent,
    scriptConsistent,
    boilerplateAvoided,
    factualGroundingScore,
    nonHumanCompliant,
    outOfScopeHandled,
    passed,
    notes,
  };
}

/**
 * Aggregates scores across all evaluated scenarios.
 */
export function aggregateScores(scores: ScenarioScore[]): BenchmarkReport {
  const total = scores.length;
  let passedCount = 0;
  let langConsistentCount = 0;
  let scriptConsistentCount = 0;
  let boilerplateAvoidedCount = 0;
  let totalGrounding = 0;

  const categoryMap: Record<string, { total: number; passed: number }> = {};

  for (const score of scores) {
    if (score.passed) passedCount++;
    if (score.languageConsistent) langConsistentCount++;
    if (score.scriptConsistent) scriptConsistentCount++;
    if (score.boilerplateAvoided) boilerplateAvoidedCount++;
    totalGrounding += score.factualGroundingScore;

    if (!categoryMap[score.category]) {
      categoryMap[score.category] = { total: 0, passed: 0 };
    }
    categoryMap[score.category]!.total++;
    if (score.passed) categoryMap[score.category]!.passed++;
  }

  const categoryBreakdown: Record<string, { total: number; passed: number; passRate: number }> = {};
  for (const [cat, data] of Object.entries(categoryMap)) {
    categoryBreakdown[cat] = {
      total: data.total,
      passed: data.passed,
      passRate: total > 0 ? Math.round((data.passed / data.total) * 100) : 0,
    };
  }

  return {
    totalScenarios: total,
    passedScenarios: passedCount,
    passRate: total > 0 ? Math.round((passedCount / total) * 100) : 0,
    languageConsistencyRate: total > 0 ? Math.round((langConsistentCount / total) * 100) : 0,
    scriptConsistencyRate: total > 0 ? Math.round((scriptConsistentCount / total) * 100) : 0,
    factualGroundingAverage: total > 0 ? Math.round((totalGrounding / total) * 100) : 0,
    boilerplateAvoidanceRate: total > 0 ? Math.round((boilerplateAvoidedCount / total) * 100) : 0,
    categoryBreakdown,
  };
}
