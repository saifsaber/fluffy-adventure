import { CAUSE_REGISTRY, type CauseTag } from '@dakka/engine';
import type { Locale } from './locale.js';

/**
 * How each cause is said, in both languages.
 *
 * `Record<CauseTag, Record<Locale, Phrasing>>`, so a cause the engine can emit but nobody has
 * phrased — or has phrased in one language only — is a build error (ADR-003 §1). This is the table
 * that makes translating a market a column rather than a rewrite, and it is the reason the cause
 * set is a closed enum instead of generated prose: the model narrates from here, so it physically
 * cannot explain a match with a reason the engine never emitted.
 *
 * **`one` and `many` exist because of a measurement, not a hunch.** Over 1,200 matches with
 * randomised tactics and in-match decisions (`pnpm causes`), `WASTEFUL_FINISHING` appears in 85% of
 * traces and up to **seven times in one match**. Three phrasings would still have repeated, and
 * `dakka-arabic-voice` forbids repeating a template inside one match. Three wordings of "he missed"
 * in a row is also just bad football writing: a coach says *they wasted four clear chances*, once.
 * So a repeated cause collapses into its `many` form with a count.
 *
 * Neither language is a translation of the other, and a test fails if any string appears in both.
 */
export interface Phrasing {
  /** The short name, for the trace screen. A label, not a sentence. */
  readonly label: string;
  /** One occurrence. May use `{minute}` and `{actor}`. */
  readonly one: string;
  /** Several occurrences, collapsed. Must use `{count}`. */
  readonly many: string;
  /**
   * What to do about it next time.
   *
   * Present for exactly the causes the registry marks `controllable`, and absent for the rest — a
   * test enforces both directions. Advice attached to something the manager could not have changed
   * is noise, and worse, it implies a control that does not exist.
   */
  readonly lesson?: string;
}

export const PHRASINGS: Record<CauseTag, Record<Locale, Phrasing>> = {
  HIGH_LINE_VS_PACE: {
    'ar-EG': {
      label: 'الخط العالي اتاكل سرعة',
      one: 'في الدقيقة {minute} الخط العالي اتاكل من ورا وراحوا بيها.',
      many: 'راحوا من ورا الخط {count} مرات.',
      lesson: 'لو قدامك سرعة، نزّل الخط شوية أو سيب تغطية ورا الظهير.',
    },
    en: {
      label: 'High line beaten for pace',
      one: 'On {minute} they ran in behind your line.',
      many: 'They got in behind you {count} times.',
      lesson: 'Against pace, drop the line or leave cover behind the full-back.',
    },
  },
  DEEP_BLOCK_ABSORBED_PRESSURE: {
    'ar-EG': {
      label: 'قفلة امتصت الضغط',
      one: 'في الدقيقة {minute} القفلة بلعت الضغط وماطلعش منها حاجة.',
      many: 'قفلتهم امتصت ضغطك {count} مرات.',
      lesson: 'قدام بلوك واطي وسّع اللعب واشتغل على الكور الثابتة. النص مقفول.',
    },
    en: {
      label: 'Deep block soaked it up',
      one: 'On {minute} the block absorbed it and nothing came of it.',
      many: 'Their block swallowed your pressure {count} times.',
      lesson: 'Against a low block, go wide and work set pieces. The middle is shut.',
    },
  },
  MIDFIELD_OVERLOAD: {
    'ar-EG': {
      label: 'زيادة عدد في الوسط',
      one: 'في الدقيقة {minute} كنت زايد عدد في الوسط والكورة بقت عندك.',
      many: 'زيادة العدد في الوسط دفعتلك {count} مرات.',
      lesson: 'الوسط في إيدك — إستغلها وطلّع الظهير.',
    },
    en: {
      label: 'Extra man in midfield',
      one: 'On {minute} you had the extra body in there and the ball stayed with you.',
      many: 'The midfield overload paid {count} times.',
      lesson: 'Midfield is yours. Push a full-back on and use it.',
    },
  },
  MIDFIELD_OUTNUMBERED: {
    'ar-EG': {
      label: 'مكسور في الوسط',
      one: 'في الدقيقة {minute} الوسط اتكسر وعدّوا منه.',
      many: 'عدّوا من النص {count} مرات.',
      lesson: 'ناقص واحد في النص. نزّل لاعب من الأمام أو ضيّق الشكل.',
    },
    en: {
      label: 'Outnumbered in midfield',
      one: 'On {minute} the midfield gave way and they came straight through.',
      many: 'They came through the middle {count} times.',
      lesson: "You're a body short in there. Drop a forward in or narrow up.",
    },
  },
  WIDE_OVERLOAD: {
    'ar-EG': {
      label: 'تكتل على الجنب',
      one: 'في الدقيقة {minute} بقيتوا اتنين على واحد على الجنب وطلعت منها.',
      many: 'الجنب دفعلك {count} مرات.',
      lesson: 'الجنب ده سايب. طلّع الظهير مع الجناح على طول.',
    },
    en: {
      label: 'Overload out wide',
      one: 'On {minute} you got two against one out wide and it came off.',
      many: 'The flank came off {count} times.',
      lesson: 'That side is open. Send the full-back up with the winger every time.',
    },
  },
  NARROW_SHAPE_CONCEDED_FLANKS: {
    'ar-EG': {
      label: 'التضييق سلّم الأطراف',
      one: 'في الدقيقة {minute} الشكل الضيق سابلهم الطرف وجابوا منه.',
      many: 'نزلوا من بره {count} مرات.',
      lesson: 'وسّع الشكل، أو خلي الجناح ينزل يغطي الظهير.',
    },
    en: {
      label: 'Narrow shape gave up the flanks',
      one: 'On {minute} the narrow shape left the wing open and it cost you.',
      many: 'They got down the outside {count} times.',
      lesson: 'Widen up, or make the winger track back with the full-back.',
    },
  },
  FORMATION_MISMATCH: {
    'ar-EG': {
      label: 'الرسمة مش مظبوطة قدامه',
      one: 'في الدقيقة {minute} الرسمة كانت غلط قدام شكلهم.',
      many: 'الرسمة كانت غلط قدامهم {count} مرات.',
      lesson: 'شكلهم بياكل شكلك. غيّر الرسمة، مش اللاعيبة.',
    },
    en: {
      label: "Shapes didn't match up",
      one: 'On {minute} your shape was wrong against theirs.',
      many: 'Your shape was wrong against theirs {count} times.',
      lesson: 'Their formation beats yours. Change the shape, not the players.',
    },
  },

  PRESS_BYPASSED: {
    'ar-EG': {
      label: 'الضغط اتعدّى',
      one: 'في الدقيقة {minute} عدّوا ضغطك بكورة واحدة.',
      many: 'عدّوا الضغط {count} مرات.',
      lesson: 'الضغط بيتاكل. يا تضغط بعدد أكتر، يا ترجع تستنى.',
    },
    en: {
      label: 'Press played through',
      one: 'On {minute} one pass took your press out of the game.',
      many: 'They played through the press {count} times.',
      lesson: "The press isn't working. Commit more bodies or sit off.",
    },
  },
  PRESS_FORCED_TURNOVER: {
    'ar-EG': {
      label: 'الضغط خطف الكورة',
      one: 'في الدقيقة {minute} الضغط خطف الكورة في نص ملعبهم.',
      many: 'الضغط خطف الكورة {count} مرات.',
      lesson: 'الضغط شغال. كمّل عليه وماترجعش بدري.',
    },
    en: {
      label: 'Press won it back',
      one: 'On {minute} the press won it high up the pitch.',
      many: 'The press won it back {count} times.',
      lesson: "It's working. Keep it on and don't drop off early.",
    },
  },
  COUNTER_ATTACK_EXPOSURE: {
    'ar-EG': {
      label: 'مكشوف في المرتد',
      one: 'في الدقيقة {minute} اتكشفت في المرتد.',
      many: 'ضربوك مرتد {count} مرات.',
      lesson: 'سيب واحد ورا وإنت طالع. المرتد بياخد منك أهداف.',
    },
    en: {
      label: 'Open to the counter',
      one: 'On {minute} you were wide open on the break.',
      many: 'They broke on you {count} times.',
      lesson: 'Leave someone back when you go forward. The counter is hurting you.',
    },
  },

  FATIGUE_COLLAPSE: {
    'ar-EG': {
      label: 'الفريق فيّس',
      one: 'في الدقيقة {minute} الرجلين وقفت.',
      many: 'التعب ضربك {count} مرات.',
      lesson: 'بدّل بدري المرة الجاية، أو نزّل الضغط بعد الشوط.',
    },
    en: {
      label: 'Legs went',
      one: 'On {minute} the legs were gone.',
      many: 'Fatigue told {count} times.',
      lesson: 'Change earlier next time, or take the press off after the break.',
    },
  },
  FRESH_LEGS_ADVANTAGE: {
    'ar-EG': {
      label: 'رجلين جديدة من الدكة',
      one: 'في الدقيقة {minute} الدكة جابت دم جديد وفرقت.',
      many: 'الدكة فرقت {count} مرات.',
      lesson: 'التبديل اشتغل. خد بالك من ميعاده المرة الجاية.',
    },
    en: {
      label: 'Fresh legs off the bench',
      one: 'On {minute} the change put fresh legs on and it showed.',
      many: 'The bench made the difference {count} times.',
      lesson: 'That worked. Remember when you made it.',
    },
  },

  SUBSTITUTION_SWUNG_MOMENTUM: {
    'ar-EG': {
      label: 'التبديل قلب الماتش',
      one: 'في الدقيقة {minute} تبديلك قلب الماتش.',
      many: 'تبديلاتك قلبت الماتش {count} مرات.',
      lesson: 'ده كان قرار صح. نفس التوقيت المرة الجاية.',
    },
    en: {
      label: 'Substitution swung it',
      one: 'On {minute} your change turned the game.',
      many: 'Your changes turned it {count} times.',
      lesson: 'That was the right call. Same timing next time.',
    },
  },
  MISSED_SUBSTITUTION_WINDOW: {
    'ar-EG': {
      label: 'فات وقت التبديل',
      one: 'في الدقيقة {minute} كان لازم تبدّل وماعملتش.',
      many: 'فات عليك وقت التبديل {count} مرات.',
      lesson: 'لما تشوف الرجلين بتقف، بدّل. الاستنى بيكلّف.',
    },
    en: {
      label: 'Left the change too late',
      one: 'On {minute} the change needed making and you sat on it.',
      many: 'You left it too late {count} times.',
      lesson: 'When the legs go, make the change. Waiting costs you.',
    },
  },
  MENTALITY_SHIFT_PAID_OFF: {
    'ar-EG': {
      label: 'تغيير الأسلوب جاب نتيجة',
      one: 'في الدقيقة {minute} تغيير الأسلوب جاب نتيجة.',
      many: 'تغيير الأسلوب جاب نتيجة {count} مرات.',
      lesson: 'قريت الماتش صح. إمشي بنفس الحس.',
    },
    en: {
      label: 'The switch paid off',
      one: 'On {minute} the change of approach paid off.',
      many: 'The switch paid off {count} times.',
      lesson: 'You read that right. Trust it again.',
    },
  },
  MENTALITY_SHIFT_BACKFIRED: {
    'ar-EG': {
      label: 'تغيير الأسلوب ضرب في إيدك',
      one: 'في الدقيقة {minute} تغيير الأسلوب ضرب في إيدك.',
      many: 'تغيير الأسلوب ضرب في إيدك {count} مرات.',
      lesson: 'ماكانش وقته. إستنى لحد ما تبقى محتاجه فعلاً.',
    },
    en: {
      label: 'The switch backfired',
      one: 'On {minute} the change of approach backfired.',
      many: 'The switch backfired {count} times.',
      lesson: 'Wrong moment. Wait until you actually need it.',
    },
  },
  ROLE_MISFIT: {
    'ar-EG': {
      label: 'الدور مش على مقاسه',
      one: 'في الدقيقة {minute} {actor} كان بيلعب دور مش بتاعه.',
      many: 'في {count} لحظات كان في لاعب في دور مش بتاعه.',
      lesson: 'شوف الدور قبل الاسم. الحريف في مكان غلط بيبقى عادي.',
    },
    en: {
      label: 'Wrong role for him',
      one: 'On {minute} {actor} was playing a role that is not his.',
      many: 'A player was in the wrong role {count} times.',
      lesson: 'Pick the role before the name. A good player in the wrong job is an average one.',
    },
  },

  CLINICAL_FINISHING: {
    'ar-EG': {
      label: 'إنهاء حريف',
      one: 'في الدقيقة {minute} {actor} ماضيّعش.',
      many: 'الإنهاء كان حريف {count} مرات.',
    },
    en: {
      label: 'Clinical in front of goal',
      one: 'On {minute} {actor} took it first time and buried it.',
      many: 'The finishing was clinical {count} times.',
    },
  },
  WASTEFUL_FINISHING: {
    'ar-EG': {
      label: 'ضيّعوا اللي جالهم',
      one: 'في الدقيقة {minute} {actor} ضيّع فرصة نضيفة.',
      many: 'ضاع {count} فرص نضيفة.',
    },
    en: {
      label: 'Wasteful with the chances',
      one: 'On {minute} {actor} missed one he should be scoring.',
      many: '{count} clear chances went begging.',
    },
  },
  KEEPER_HEROICS: {
    'ar-EG': {
      label: 'الجول شال الفريق',
      one: 'في الدقيقة {minute} الجول طلّعها من تحت العارضة.',
      many: 'الجول شال الفريق {count} مرات.',
    },
    en: {
      label: 'Keeper kept them in it',
      one: 'On {minute} the keeper got a hand to one he had no right to.',
      many: 'The keeper saved them {count} times.',
    },
  },
  KEEPER_ERROR: {
    'ar-EG': {
      label: 'غلطة من الجول',
      one: 'في الدقيقة {minute} الجول غلط غلطة.',
      many: 'الجول غلط {count} مرات.',
    },
    en: {
      label: 'Keeper error',
      one: 'On {minute} the keeper made a mess of it.',
      many: 'The keeper made {count} mistakes.',
    },
  },
  INDIVIDUAL_BRILLIANCE: {
    'ar-EG': {
      label: 'لمسة حريف',
      one: 'في الدقيقة {minute} {actor} عمل حاجة لوحده.',
      many: 'لمسة فردية فرقت {count} مرات.',
    },
    en: {
      label: 'A moment of individual quality',
      one: 'On {minute} {actor} did it on his own.',
      many: 'Individual quality decided it {count} times.',
    },
  },

  RED_CARD: {
    'ar-EG': {
      label: 'كارت أحمر',
      one: 'في الدقيقة {minute} طلع كارت أحمر.',
      many: 'طلع {count} كروت حمرا.',
    },
    en: {
      label: 'Red card',
      one: 'On {minute} a red card changed the game.',
      many: 'There were {count} red cards.',
    },
  },
  SET_PIECE_ADVANTAGE: {
    'ar-EG': {
      label: 'قوة في الكور الثابتة',
      one: 'في الدقيقة {minute} الكورة الثابتة جابتلك حاجة.',
      many: 'الكور الثابتة دفعتلك {count} مرات.',
      lesson: 'الكور الثابتة سلاحك. إشتغل عليها أكتر.',
    },
    en: {
      label: 'Strong from set pieces',
      one: 'On {minute} a set piece gave you something.',
      many: 'Set pieces paid {count} times.',
      lesson: 'That is a weapon. Work on it more.',
    },
  },
  SET_PIECE_WEAKNESS: {
    'ar-EG': {
      label: 'ضعف في الكور الثابتة',
      one: 'في الدقيقة {minute} اتعملت عليك من كورة ثابتة.',
      many: 'الكور الثابتة أكلتك {count} مرات.',
      lesson: 'غطي المنطقة كويس، وحط طول على العمود القريب.',
    },
    en: {
      label: 'Soft from set pieces',
      one: 'On {minute} a set piece hurt you.',
      many: 'Set pieces hurt you {count} times.',
      lesson: 'Get the box covered and put height on the near post.',
    },
  },

  HOME_CROWD_LIFT: {
    'ar-EG': {
      label: 'الجمهور دفع الفريق',
      one: 'في الدقيقة {minute} الجمهور دفع الفريق.',
      many: 'الجمهور دفعهم {count} مرات.',
    },
    en: {
      label: 'Home crowd lifted them',
      one: 'On {minute} the crowd got behind them.',
      many: 'The crowd lifted them {count} times.',
    },
  },
  PITCH_CONDITIONS: {
    'ar-EG': {
      label: 'أرضية الملعب',
      one: 'في الدقيقة {minute} الأرضية لعبت دور.',
      many: 'الأرضية أثّرت {count} مرات.',
    },
    en: {
      label: 'State of the pitch',
      one: 'On {minute} the surface played its part.',
      many: 'The pitch told {count} times.',
    },
  },
};

/** Convenience for the trace screen, which wants the name and nothing else. */
export const causeLabel = (cause: CauseTag, locale: Locale): string =>
  PHRASINGS[cause][locale].label;

/** Advice exists only where the manager had a choice. Read from the registry, never duplicated. */
export const isControllable = (cause: CauseTag): boolean =>
  CAUSE_REGISTRY[cause].agency === 'controllable';
