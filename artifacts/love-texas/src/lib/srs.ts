/**
 * Spaced Repetition System — SM-2 with "known" threshold.
 *
 * Word states:
 *  - New / Learning  (successStreak < 3): shown frequently
 *  - Known           (successStreak >= 3): 14-day minimum interval
 *
 * Error penalty resets the streak → word goes back to "learning".
 */

export interface SRSSettings {
  /** Multiplier when correct (1.5 – 3.0) */
  easyMultiplier: number;
  /** Days until next show after error (1 – 7) */
  hardPenaltyDays: number;
  /** Max interval in days */
  maxIntervalDays: number;
}

/** How many consecutive correct answers to become "known" */
export const KNOWN_THRESHOLD = 3;
/** Minimum interval (days) once a word is "known" */
export const KNOWN_INTERVAL_DAYS = 14;

const STORAGE_KEY = 'love-texas-srs-settings';

export function getSRSSettings(): SRSSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultSRS(), ...JSON.parse(raw) };
  } catch {}
  return defaultSRS();
}

function defaultSRS(): SRSSettings {
  return { easyMultiplier: 2.5, hardPenaltyDays: 1, maxIntervalDays: 180 };
}

export function saveSRSSettings(s: SRSSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export interface SRSResult {
  nextReviewAt: number;     // timestamp
  interval: number;         // days to next review
  easeFactor: number;       // SM-2 ease factor
  reviewCount: number;      // total review count
  successStreak: number;    // consecutive correct answers (resets on error)
}

const DAY = 24 * 60 * 60 * 1000;

export function computeNextReview(
  correct: boolean,
  current: {
    interval?: number;
    easeFactor?: number;
    reviewCount?: number;
    successStreak?: number;
  },
  settings: SRSSettings
): SRSResult {
  const interval = current.interval ?? 0;
  const ease = current.easeFactor ?? 2.5;
  const count = current.reviewCount ?? 0;
  const streak = current.successStreak ?? 0;

  let newInterval: number;
  let newEase: number;
  let newStreak: number;

  if (!correct) {
    // Error: reset streak, penalty interval, reduce ease
    newStreak = 0;
    newInterval = settings.hardPenaltyDays;
    newEase = Math.max(1.3, ease - 0.2);
  } else {
    newStreak = streak + 1;
    newEase = Math.min(3.0, ease + 0.05);

    if (newStreak >= KNOWN_THRESHOLD) {
      // Word is "known" — use longer intervals
      if (interval === 0) {
        newInterval = KNOWN_INTERVAL_DAYS;
      } else {
        newInterval = Math.min(
          settings.maxIntervalDays,
          Math.round(interval * newEase)
        );
        if (newInterval < KNOWN_INTERVAL_DAYS) newInterval = KNOWN_INTERVAL_DAYS;
      }
    } else {
      // Still learning — short steps: 1 → 3 → 7
      if (streak === 0) newInterval = 1;
      else if (streak === 1) newInterval = 3;
      else newInterval = 7;
    }
  }

  return {
    nextReviewAt: Date.now() + newInterval * DAY,
    interval: newInterval,
    easeFactor: newEase,
    reviewCount: count + 1,
    successStreak: newStreak,
  };
}

export function isWordKnown(word: { successStreak?: number }): boolean {
  return (word.successStreak ?? 0) >= KNOWN_THRESHOLD;
}

export function isWordDue(word: { nextReviewAt?: number }): boolean {
  return !word.nextReviewAt || word.nextReviewAt <= Date.now();
}

/** Human-readable next review time */
export function formatNextReview(nextReviewAt: number | undefined): string {
  if (!nextReviewAt) return 'сейчас';
  const diff = nextReviewAt - Date.now();
  if (diff <= 0) return 'сейчас';
  const hours = Math.round(diff / (1000 * 60 * 60));
  if (hours < 24) return `через ${hours} ч.`;
  const days = Math.round(diff / DAY);
  if (days === 1) return 'завтра';
  if (days < 5) return `через ${days} дня`;
  return `через ${days} дней`;
}
