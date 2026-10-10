import { describe, it, expect } from 'vitest';
import { MultilingualPromptBuilder } from '../prompt-builder.js';

describe('Multilingual Prompt Builder & Policy Synthesis', () => {
  const builder = new MultilingualPromptBuilder();

  it('enforces strict Latin script directive and bans Arabic script for Roman Urdu visitors', () => {
    const prompt = builder.buildSystemPrompt({
      sitePersona: { siteName: 'TestShop', botName: 'TestBot' },
      detectedLang: {
        language: 'roman-ur',
        script: 'latin',
        confidence: 0.95,
        isCodeSwitching: false,
        codeSwitchLanguages: ['roman-ur'],
        explicitSwitchRequested: false,
        explanation: 'Roman Urdu query',
      },
      recentTurns: [],
      userQuery: 'bhai delivery kab tak hogi?',
    });

    expect(prompt).toContain('ROMAN URDU');
    expect(prompt).toContain('LATIN ALPHABET');
    expect(prompt).toContain('DO NOT use Arabic / Perso-Arabic Urdu script');
  });

  it('enforces Urdu script directive for Arabic/Perso-Arabic Urdu visitors', () => {
    const prompt = builder.buildSystemPrompt({
      sitePersona: { siteName: 'TestShop', botName: 'TestBot' },
      detectedLang: {
        language: 'ur',
        script: 'arabic',
        confidence: 0.95,
        isCodeSwitching: false,
        codeSwitchLanguages: ['ur'],
        explicitSwitchRequested: false,
        explanation: 'Urdu query',
      },
      recentTurns: [],
      userQuery: 'ڈلیوری کا وقت کیا ہے؟',
    });

    expect(prompt).toContain('URDU SCRIPT');
    expect(prompt).toContain('Arabic/Perso-Arabic script');
  });

  it('mandates non-human identity disclosure and bans fake human personas', () => {
    const prompt = builder.buildSystemPrompt({
      sitePersona: { siteName: 'Fashion Hub', botName: 'FashionBot' },
      detectedLang: {
        language: 'en',
        script: 'latin',
        confidence: 0.99,
        isCodeSwitching: false,
        codeSwitchLanguages: ['en'],
        explicitSwitchRequested: false,
        explanation: 'English query',
      },
      recentTurns: [],
      userQuery: 'Who are you?',
    });

    expect(prompt).toContain('Never pretend to be a human customer support agent');
    expect(prompt).toContain('dedicated virtual AI assistant');
  });

  it('enforces answer-first policy and bans boilerplate pleasantries', () => {
    const prompt = builder.buildSystemPrompt({
      sitePersona: { siteName: 'Store', botName: 'Bot' },
      detectedLang: {
        language: 'en',
        script: 'latin',
        confidence: 0.95,
        isCodeSwitching: false,
        codeSwitchLanguages: ['en'],
        explicitSwitchRequested: false,
        explanation: 'English',
      },
      recentTurns: [],
      userQuery: 'price?',
    });

    expect(prompt).toContain('ANSWER THE ACTUAL QUESTION FIRST');
    expect(prompt).toContain('NO BOILERPLATE GREETINGS');
    expect(prompt).toContain('The visitor asked a very short or follow-up question');
  });

  it('injects summarized previous turn context without repeating', () => {
    const prompt = builder.buildSystemPrompt({
      sitePersona: { siteName: 'Store', botName: 'Bot' },
      detectedLang: {
        language: 'en',
        script: 'latin',
        confidence: 0.95,
        isCodeSwitching: false,
        codeSwitchLanguages: ['en'],
        explicitSwitchRequested: false,
        explanation: 'English',
      },
      historySummary: {
        keyPreferences: ['User wants Medium size in Black'],
        verifiedFacts: ['Standard delivery takes 3 business days'],
        unresolvedQuestions: [],
      },
      recentTurns: [],
      userQuery: 'Can I add gift wrapping?',
    });

    expect(prompt).toContain('CONVERSATION CONTEXT FROM PREVIOUS TURNS:');
    expect(prompt).toContain('User wants Medium size in Black');
    expect(prompt).toContain('Standard delivery takes 3 business days');
  });
});
