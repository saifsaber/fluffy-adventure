import type { CauseTag } from '@dakka/engine';
import type { Locale } from './locale.js';

/**
 * What each cause is called, in both locales.
 *
 * `Record<CauseTag, Record<Locale, string>>` — a cause the engine can emit but nobody has named, or
 * has named in only one language, is a build error (ADR-003 §1). That guard is the whole reason the
 * cause set is a closed enum rather than generated prose: the screen physically cannot show a
 * reason the engine did not emit, and adding a language is a column rather than a rewrite.
 *
 * **Scope.** These are *names*, which is all the trace needs: a label beside a minute and a number.
 * The richer `Phrasing` the AI layer narrates with — the sentence, its actors, its short and long
 * forms — is Step 7's, and belongs in `packages/ai` where prompts can reach it. Keeping the name
 * here means the trace screen never has to wait for a model, and never has one in the loop.
 *
 * Neither column is a translation of the other.
 */
export const CAUSE_LABEL: Record<CauseTag, Record<Locale, string>> = {
  // Shape and space
  HIGH_LINE_VS_PACE: { 'ar-EG': 'الخط العالي اتاكل سرعة', en: 'High line beaten for pace' },
  DEEP_BLOCK_ABSORBED_PRESSURE: { 'ar-EG': 'قفلة امتصت الضغط', en: 'Deep block soaked it up' },
  MIDFIELD_OVERLOAD: { 'ar-EG': 'زيادة عدد في الوسط', en: 'Extra man in midfield' },
  MIDFIELD_OUTNUMBERED: { 'ar-EG': 'مكسور في الوسط', en: 'Outnumbered in midfield' },
  WIDE_OVERLOAD: { 'ar-EG': 'تكتل على الجنب', en: 'Overload out wide' },
  NARROW_SHAPE_CONCEDED_FLANKS: {
    'ar-EG': 'التضييق سلّم الأطراف',
    en: 'Narrow shape gave up the flanks',
  },
  FORMATION_MISMATCH: { 'ar-EG': 'الرسمة مش مظبوطة قدامه', en: "Shapes didn't match up" },

  // Pressing
  PRESS_BYPASSED: { 'ar-EG': 'الضغط اتعدّى', en: 'Press played through' },
  PRESS_FORCED_TURNOVER: { 'ar-EG': 'الضغط خطف الكورة', en: 'Press won it back' },
  COUNTER_ATTACK_EXPOSURE: { 'ar-EG': 'مكشوف في المرتد', en: 'Open to the counter' },

  // Condition
  FATIGUE_COLLAPSE: { 'ar-EG': 'الفريق فيّس', en: 'Legs went' },
  FRESH_LEGS_ADVANTAGE: { 'ar-EG': 'رجلين جديدة من الدكة', en: 'Fresh legs off the bench' },

  // Manager decisions
  SUBSTITUTION_SWUNG_MOMENTUM: { 'ar-EG': 'التبديل قلب الماتش', en: 'Substitution swung it' },
  MISSED_SUBSTITUTION_WINDOW: { 'ar-EG': 'فات وقت التبديل', en: 'Left the change too late' },
  MENTALITY_SHIFT_PAID_OFF: { 'ar-EG': 'تغيير الأسلوب جاب نتيجة', en: 'The switch paid off' },
  MENTALITY_SHIFT_BACKFIRED: { 'ar-EG': 'تغيير الأسلوب ضرب في إيدك', en: 'The switch backfired' },
  ROLE_MISFIT: { 'ar-EG': 'الدور مش على مقاسه', en: 'Wrong role for him' },

  // Individual moments
  CLINICAL_FINISHING: { 'ar-EG': 'إنهاء حريف', en: 'Clinical in front of goal' },
  WASTEFUL_FINISHING: { 'ar-EG': 'ضيّعوا اللي جالهم', en: 'Wasteful with the chances' },
  KEEPER_HEROICS: { 'ar-EG': 'الجول شال الفريق', en: 'Keeper kept them in it' },
  KEEPER_ERROR: { 'ar-EG': 'غلطة من الجول', en: 'Keeper error' },
  INDIVIDUAL_BRILLIANCE: { 'ar-EG': 'لمسة حريف', en: 'A moment of individual quality' },

  // Discipline and dead balls
  RED_CARD: { 'ar-EG': 'كارت أحمر', en: 'Red card' },
  SET_PIECE_ADVANTAGE: { 'ar-EG': 'قوة في الكور الثابتة', en: 'Strong from set pieces' },
  SET_PIECE_WEAKNESS: { 'ar-EG': 'ضعف في الكور الثابتة', en: 'Soft from set pieces' },

  // Context
  HOME_CROWD_LIFT: { 'ar-EG': 'الجمهور دفع الفريق', en: 'Home crowd lifted them' },
  PITCH_CONDITIONS: { 'ar-EG': 'أرضية الملعب', en: 'State of the pitch' },
};
