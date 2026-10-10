import { describe, it, expect } from 'vitest';
import { detectLanguageAndScript } from '../language-detector.js';

describe('Language & Script Detection Module', () => {
  it('correctly detects English text in Latin script', () => {
    const res = detectLanguageAndScript('How long does standard delivery take to the UK?');
    expect(res.language).toBe('en');
    expect(res.script).toBe('latin');
    expect(res.isCodeSwitching).toBe(false);
  });

  it('correctly detects Roman Urdu (Latin script) without confusing with English', () => {
    const res = detectLanguageAndScript('bhai delivery kitne din mein hogi Lahore mein?');
    expect(res.language).toBe('roman-ur');
    expect(res.script).toBe('latin');
    expect(res.isCodeSwitching).toBe(true); // contains "Lahore" and English vocabulary
  });

  it('correctly detects pure Roman Urdu sentences', () => {
    const res = detectLanguageAndScript('aap ka saman bohot acha hai shukriya');
    expect(res.language).toBe('roman-ur');
    expect(res.script).toBe('latin');
  });

  it('correctly detects Urdu in Arabic/Perso-Arabic script', () => {
    const res = detectLanguageAndScript('ڈلیوری میں کتنے دن لگیں گے اور واپسی کی پالیسی کیا ہے؟');
    expect(res.language).toBe('ur');
    expect(res.script).toBe('arabic');
  });

  it('detects code-switching with English domain terms embedded in Roman Urdu', () => {
    const res = detectLanguageAndScript('product ka checkout URL kahan hai and payment options kya hain?');
    expect(res.language).toBe('roman-ur');
    expect(res.script).toBe('latin');
    expect(res.isCodeSwitching).toBe(true);
    expect(res.codeSwitchLanguages).toContain('roman-ur');
    expect(res.codeSwitchLanguages).toContain('en');
  });

  it('identifies explicit switch directives to Roman Urdu', () => {
    const res = detectLanguageAndScript('Please speak in Roman Urdu from now on');
    expect(res.explicitSwitchRequested).toBe(true);
    expect(res.requestedLanguage).toBe('roman-ur');
    expect(res.requestedScript).toBe('latin');
  });

  it('identifies explicit switch directives to Urdu script', () => {
    const res = detectLanguageAndScript('اب اردو میں بتائیں مہربانی کر کے');
    expect(res.language).toBe('ur');
    expect(res.script).toBe('arabic');
    expect(res.explicitSwitchRequested).toBe(true);
  });

  it('identifies explicit switch directives to English', () => {
    const res = detectLanguageAndScript('bhai please speak in English now');
    expect(res.explicitSwitchRequested).toBe(true);
    expect(res.requestedLanguage).toBe('en');
  });

  it('resolves single-word short queries in Roman Urdu', () => {
    const res1 = detectLanguageAndScript('kab?');
    expect(res1.language).toBe('roman-ur');

    const res2 = detectLanguageAndScript('kitna?');
    expect(res2.language).toBe('roman-ur');
  });

  it('handles typos and phonetic variations in Roman Urdu', () => {
    const res = detectLanguageAndScript('delvry kab tk aye gi bht dair ho gai');
    expect(res.language).toBe('roman-ur');
    expect(res.script).toBe('latin');
  });
});
