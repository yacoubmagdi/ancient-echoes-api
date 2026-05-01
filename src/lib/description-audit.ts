/**
 * Description audit utilities — validates historical persona descriptions
 * before they are saved to the database.
 */

export interface AuditResult {
  valid: boolean;
  score: number; // 1–10
  issues: string[];
}

// Superlatives and exaggeration markers (Arabic + English)
const EXAGGERATION_PATTERNS = [
  /أعظم\s+(شخصي[ةت]|إنسان|حاكم|ملك|فرعون)/i,
  /الأعظم\s+في\s+التاريخ/i,
  /لا\s+مثيل\s+له/i,
  /لم\s+يسبق\s+له\s+مثيل/i,
  /أول\s+من\s+(اخترع|اكتشف|بنى)/i,
  /بلا\s+منازع/i,
  /على\s+الإطلاق/i,
  /الأفضل\s+في\s+تاريخ/i,
  /greatest\s+(ever|of\s+all\s+time)/i,
  /single-handedly/i,
  /unmatched\s+in\s+history/i,
];

// Modern anachronistic terms that shouldn't appear in ancient descriptions
const ANACHRONISM_PATTERNS = [
  /الإنترنت/,
  /الكمبيوتر/,
  /البريد\s+الإلكتروني/,
  /internet/i,
  /computer/i,
  /electricity/i,
  /الكهرباء/,
];

const MIN_LENGTH = 40;
const MAX_LENGTH = 2000;
const MIN_SENTENCES = 2;
const MAX_SENTENCES = 8;

/**
 * Count approximate sentences in Arabic/mixed text.
 */
export function countSentences(text: string): number {
  // Split on period, exclamation, question mark, or Arabic full-stop (。is CJK, ۔ is Urdu)
  const parts = text.split(/[.!?؟。۔]+/).filter((s) => s.trim().length > 5);
  return parts.length;
}

/**
 * Audit a description for exaggerations, anachronisms, length, and sentence count.
 * Returns an AuditResult with score and list of issues.
 */
export function auditDescription(description: string | null | undefined): AuditResult {
  const issues: string[] = [];
  let score = 10;

  if (!description || typeof description !== "string") {
    return { valid: false, score: 0, issues: ["الوصف فارغ أو غير صالح"] };
  }

  const text = description.trim();

  // Length checks
  if (text.length < MIN_LENGTH) {
    issues.push(`الوصف قصير جدًا (${text.length} حرف، الحد الأدنى ${MIN_LENGTH})`);
    score -= 4;
  }
  if (text.length > MAX_LENGTH) {
    issues.push(`الوصف طويل جدًا (${text.length} حرف، الحد الأقصى ${MAX_LENGTH})`);
    score -= 2;
  }

  // Sentence count
  const sentences = countSentences(text);
  if (sentences < MIN_SENTENCES) {
    issues.push(`عدد الجمل قليل (${sentences}، الحد الأدنى ${MIN_SENTENCES})`);
    score -= 3;
  }
  if (sentences > MAX_SENTENCES) {
    issues.push(`عدد الجمل كثير (${sentences}، الحد الأقصى ${MAX_SENTENCES})`);
    score -= 1;
  }

  // Exaggeration check
  for (const pattern of EXAGGERATION_PATTERNS) {
    if (pattern.test(text)) {
      issues.push(`مبالغة تاريخية: "${text.match(pattern)?.[0]}"`);
      score -= 2;
    }
  }

  // Anachronism check
  for (const pattern of ANACHRONISM_PATTERNS) {
    if (pattern.test(text)) {
      issues.push(`مصطلح عصري غير مناسب: "${text.match(pattern)?.[0]}"`);
      score -= 3;
    }
  }

  score = Math.max(0, Math.min(10, score));

  return {
    valid: score >= 6 && issues.length === 0,
    score,
    issues,
  };
}

/**
 * Gate function: returns true only if description passes audit with score >= threshold.
 */
export function isDescriptionAcceptable(description: string, threshold = 6): boolean {
  const result = auditDescription(description);
  return result.score >= threshold && result.issues.length === 0;
}