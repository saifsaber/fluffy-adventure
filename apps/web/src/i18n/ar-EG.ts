import type { Dictionary } from './messages.js';

/**
 * Egyptian colloquial, per `.claude/skills/dakka-arabic-voice`.
 *
 * Not MSA and not translated English: the assistant coach is blunt, talks the way a coach on the
 * touchline talks, and does not flatter. Numbers stay in Latin digits and technical terms stay
 * Latin, because that is how Egyptian football people write them.
 */
export const arEG: Dictionary = {
  'app.name': 'دكة',
  'app.subtitle': 'كل رقم هنا ليه سبب تقدر توصله.',

  'locale.switcher': 'اللغة',
  'locale.ar-EG': 'مصري',
  'locale.en': 'English',

  'setup.shape': 'شكل الملعب',
  'setup.shape.note': 'فريقك بس',
  'setup.shape.alt': 'تشكيل {club} على الملعب',
  'setup.opponent.unseen':
    'مالعبناهمش قبل كده، فمفيش حاجة نرسمهالك عنهم. أول ما تلعبهم هتشوف شغلهم هنا.',
  'setup.title': 'الماتش الجاي',
  'setup.yourClub': 'فريقك',
  'setup.opponent': 'الخصم',
  'setup.venue': 'الملعب',
  'setup.venue.home': 'على أرضك',
  'setup.venue.away': 'بره',
  'setup.approach': 'الأسلوب',
  'setup.line': 'الخط الدفاعي',
  'setup.press': 'الضغط',
  'setup.call': 'قرار جوه الماتش',
  'setup.call.why':
    'إختار حاجة واحدة تغيّرها والماتش شغال. بعد ما يخلص هنعيده من غير القرار ده، ونقولك عمل إيه بالظبط.',
  'setup.call.none': 'من غير قرار',
  'setup.call.minute': 'الدقيقة',
  'setup.opponent.baseline':
    'الخصم لسه مالوش مدرب: بيلعب بتشكيل عادي وكل الدوايير في النص. لما نديله قرارات هنقولك.',
  'setup.attendance': 'الحضور',
  'setup.sheet': 'التشكيل',
  'setup.sheet.auto':
    'التشكيل دلوقتي بيتختار لوحده: أحسن لاعب موجود في كل مركز. إختيار اللاعيبة بإيدك لسه ماتعملش.',
  'setup.play': 'إلعب الماتش',

  'mentality.defensive': 'دفاعي',
  'mentality.balanced': 'متوازن',
  'mentality.attacking': 'هجومي',
  'line.deep': 'واطي',
  'line.normal': 'عادي',
  'line.high': 'عالي',
  'press.contain': 'مستني',
  'press.moderate': 'متوسط',
  'press.high': 'عالي',

  'result.fullTime': 'نهاية الماتش',
  'result.back': 'ماتش تاني',
  'result.you': 'إنت',
  'result.them': 'هما',
  'result.seed': 'الـ seed',
  'result.seed.why':
    'ده الرقم اللي طلع الماتش ده. حطه تاني بنفس الاختيارات، هيطلعلك نفس الماتش بالظبط — نفس الأهداف ونفس الدقايق.',

  'stats.title': 'الأرقام',
  'stat.shots': 'تسديدات',
  'stat.shotsOnTarget': 'على المرمى',
  'stat.blocked': 'اتصدت',
  'stat.corners': 'ركنيات',
  'stat.fouls': 'مخالفات',
  'stat.cards': 'كروت',
  'stat.possession': 'الاستحواذ',
  'stat.xg': 'xG',
  'stat.open': 'إفتح {stat} وشوف جه منين',
  'stat.close': 'إقفل',

  'why.title': 'الرقم ده جه منين',
  'why.shots':
    'كل تسديدة اتسجلت وقت ما حصلت: الدقيقة، المسافة، الزاوية، الضغط اللي كان على اللاعب، والـ xG بتاعها.',
  'why.possession': 'نسبة، محسوبة من عدد اللحظات المعدودة لكل فريق. مش تقدير.',
  'why.xg':
    'مجموع تسديدات الماتش. كل واحدة جاية من ظروفها هي: المسافة، الزاوية، الضغط، وضربها بإيه.',
  'why.cards': 'كل كارت متسجل بدقيقته وباللاعب اللي خده.',
  'why.countedOnly':
    'الرقم ده معدود لحظة ما حصل، بس المحرك لسه مابيسجلش تفاصيل كل واحدة فيهم لوحدها.',
  'why.possessionTicks': 'اللحظات المعدودة',
  'why.empty': 'مفيش حاجة تتعرض هنا. ماحصلتش ولا مرة في الماتش ده.',

  'shot.minute': 'الدقيقة',
  'shot.distance': 'المسافة',
  'shot.angle': 'الزاوية',
  'shot.pressure': 'الضغط',
  'shot.outcome': 'النتيجة',
  'shot.goal': 'جول',
  'shot.saved': 'الجول مسكها',
  'shot.blocked': 'اتصدت',
  'shot.offTarget': 'بره',
  'shot.woodwork': 'خشب',
  'card.yellow': 'أصفر',
  'card.red': 'أحمر',

  'unmeasured.title': 'حاجات مابنقيسهاش',
  'unmeasured.body':
    'المحرك مابيحسبش دي، فمش هتلاقي 0 ومش هتلاقي رقم من دماغنا. مفيش رقم أحسن من رقم مخترع.',
  'unmeasured.passes': 'التمريرات',
  'unmeasured.offsides': 'التسلل',

  'trace.title': 'الماتش اتقلب فين',
  'trace.empty': 'الماتش ما اتقلبش. مفيش لحظة حركت الحسبة بما فيه الكفاية.',
  'trace.swing': 'الحسبة اتحركت',
  'trace.favoured.you': 'ليك',
  'trace.favoured.them': 'عليك',

  'cf.title': 'لو ماكنتش عملت كده',
  'cf.why': 'نفس الماتش، نفس الـ seed، نفس اللاعيبة — والقرار بتاعك متشال. الفرق هو القرار.',
  'cf.none': 'ماخدتش قرار جوه الماتش، يبقى مفيش حاجة نشيلها.',
  'cf.run': 'شغّل المقارنة',
  'cf.running': 'بيعيد الماتش…',
  'cf.runs': '{n} إعادة',
  'cf.points': 'نقط',
  'cf.goalsFor': 'أهداف ليك',
  'cf.goalsAgainst': 'أهداف عليك',
  'cf.perMatch': 'في الماتش',
  'cf.significant': 'الفرق ده أكبر من التشويش',
  'cf.notSignificant': 'الفرق ده ممكن يكون صدفة',
  'cf.spread': 'ماتش واحد مش دليل. الرقم جنبه المدى بتاعه، وده اللي بيقول الفرق حقيقي ولا لأ.',
};
