import { describe, it, expect } from 'vitest';
import { EVALUATION_SCENARIOS, type EvaluationScenario } from '../evaluation/conversations.js';
import { evaluateResponse, aggregateScores, type ScenarioScore } from '../evaluation/evaluator.js';

/**
 * Simulates a model response adhering strictly to the synthesized prompt rules
 * for each benchmark scenario to test the evaluation harness.
 */
function simulateModelResponse(scenario: EvaluationScenario): string {
  // 1. Out of Scope
  if (scenario.expectedAspects.outOfScopeRedirectRequired) {
    if (scenario.expectedLanguage === 'roman-ur') {
      return 'Main sirf is website aur hamari services ke hawalay se madad kar sakta hoon. Website se mutaliq koi sawal ho to zaroor bataiye.';
    }
    if (scenario.expectedLanguage === 'ur') {
      return 'معذرت، میں صرف اس دکان کی مصنوعات اور خدمات کے متعلق رہنمائی کر سکتا ہوں۔';
    }
    return 'I am a virtual assistant dedicated to this website and can only assist with our store products and services. Please let me know how I can help with our catalog!';
  }

  // 2. Non-Human Disclosure
  if (scenario.expectedAspects.nonHumanDisclosureRequired) {
    if (scenario.expectedLanguage === 'roman-ur') {
      return 'Main ek automated virtual AI assistant hoon jo is website ke visitors ki madad ke liye banaya gaya hai.';
    }
    return 'I am an automated virtual AI assistant designed to help visitors with questions on this website.';
  }

  // 3. Ambiguous Clarifications
  if (scenario.expectedAspects.clarificationPermitted) {
    if (scenario.expectedLanguage === 'roman-ur') {
      return 'Ye product different devices ke sath compatible hai. Kya aap batayen gay aap kis device ya model ke liye poochna chahte hain?';
    }
    if (scenario.expectedLanguage === 'ur') {
      return 'یہ ماڈل مختلف ضروریات کے لیے ہے۔ کیا آپ وضاحت فرمائیں گے کہ آپ کی بنیادی ترجیح کیا ہے؟';
    }
    return 'Our protective sleeve fits 13-inch and 14-inch laptops. Which specific model or screen size do you have?';
  }

  // 4. Standard Responses matching Language & Script
  switch (scenario.expectedLanguage) {
    case 'ur':
      return `${scenario.siteKnowledge} اگر مزید معلومات درکار ہوں تو ضرور بتائیں۔`;

    case 'roman-ur':
      if (scenario.id === 'ru_04') {
        return 'Nova Wireless Headphones ki price PKR 4,500 hai aur ye currently stock mein available hain.';
      }
      if (scenario.id === 'ru_01') {
        return 'Lahore mein standard delivery 2 se 3 working days mein ho jati hai, jabke express delivery 24 hours leti hai.';
      }
      return `${scenario.siteKnowledge.replace(/takes 2 to 3 working days/i, '2 se 3 working days leti hai')}. Mazeed maloomat ke liye rabta kar sakte hain.`;

    case 'en':
    default:
      return `${scenario.siteKnowledge} Please let us know if you need any additional details.`;
  }
}

describe('Multilingual Natural Conversation Evaluation Suite (110 Scenarios)', () => {
  it('contains at least 100 comprehensive benchmark conversation scenarios', () => {
    expect(EVALUATION_SCENARIOS.length).toBeGreaterThanOrEqual(100);
    expect(EVALUATION_SCENARIOS.length).toBe(110);
  });

  it('covers all 11 required linguistic and behavioral categories', () => {
    const categories = new Set(EVALUATION_SCENARIOS.map((s) => s.category));
    expect(categories.has('roman_urdu')).toBe(true);
    expect(categories.has('urdu_script')).toBe(true);
    expect(categories.has('english')).toBe(true);
    expect(categories.has('mixed_language')).toBe(true);
    expect(categories.has('spelling_mistakes')).toBe(true);
    expect(categories.has('slang_and_colloquial')).toBe(true);
    expect(categories.has('short_followups')).toBe(true);
    expect(categories.has('ambiguous_questions')).toBe(true);
    expect(categories.has('emotional_customers')).toBe(true);
    expect(categories.has('unsupported_questions')).toBe(true);
    expect(categories.has('language_switching')).toBe(true);
  });

  it('evaluates all 110 scenarios and achieves >95% compliance on all core benchmarks', () => {
    const scores: ScenarioScore[] = [];

    for (const scenario of EVALUATION_SCENARIOS) {
      const response = simulateModelResponse(scenario);
      const score = evaluateResponse(scenario, response);
      scores.push(score);
    }

    const report = aggregateScores(scores);

    expect(report.totalScenarios).toBe(110);
    expect(report.scriptConsistencyRate).toBeGreaterThanOrEqual(95);
    expect(report.boilerplateAvoidanceRate).toBe(100);
    expect(report.factualGroundingAverage).toBeGreaterThanOrEqual(95);
    expect(report.passRate).toBeGreaterThanOrEqual(95);

    // Verify Roman Urdu responses NEVER leaked Arabic script
    const romanUrduScores = scores.filter((s) => s.category === 'roman_urdu');
    for (const s of romanUrduScores) {
      expect(s.scriptConsistent).toBe(true);
    }
  });

  it('detects and flags script violations (e.g. Arabic script leaked in Roman Urdu)', () => {
    const scenario = EVALUATION_SCENARIOS.find((s) => s.id === 'ru_01')!;
    const violatingResponse = 'ڈلیوری کا وقت 2 سے 3 دن ہے۔'; // Arabic script sent to Roman Urdu user

    const score = evaluateResponse(scenario, violatingResponse);
    expect(score.scriptConsistent).toBe(false);
    expect(score.passed).toBe(false);
    expect(score.notes.some((n) => n.includes('Arabic script detected'))).toBe(true);
  });

  it('detects and flags forbidden customer-service boilerplate pleasantries', () => {
    const scenario = EVALUATION_SCENARIOS.find((s) => s.id === 'en_01')!;
    const boilerplateResponse =
      'Hello and welcome to our store! Certainly, I would be delighted to assist you with our return policy today. Customers may return items in 30 days.';

    const score = evaluateResponse(scenario, boilerplateResponse);
    expect(score.boilerplateAvoided).toBe(false);
    expect(score.passed).toBe(false);
  });

  it('detects and flags false human claims', () => {
    const scenario = EVALUATION_SCENARIOS.find((s) => s.id === 'en_15')!;
    const falseHumanResponse = 'Yes, I am a real person and human employee sitting at customer support desk.';

    const score = evaluateResponse(scenario, falseHumanResponse);
    expect(score.nonHumanCompliant).toBe(false);
    expect(score.passed).toBe(false);
  });
});
