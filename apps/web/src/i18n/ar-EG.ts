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

  'match.kickoff': 'البداية',
  'match.pressure': 'الحسبة معاك',
  'match.skip': 'ودّيني على النهاية',
  'match.call': 'قرارك',
  'match.nothingYet': 'لسه مافيش حاجة تتقال.',
  'match.replay': 'الماتش خلص وإحنا بنعيده عليك دقيقة بدقيقة. تعدّي على النهاية مش هيغيّر حاجة.',

  'setup.shape': 'شكل الملعب',
  'setup.shape.note': 'فريقك بس',
  'setup.shape.alt': 'تشكيل {club} على الملعب',
  'setup.opponent.unseen':
    'مالعبناهمش قبل كده، فمفيش حاجة نرسمهالك عنهم. أول ما تلعبهم هتشوف شغلهم هنا.',
  'start.title': 'إختار النادي اللي هتدرّبه',
  'start.why':
    'المشوار كله بيتبني على الاختيار ده: الجدول، اللي المجلس هيطلبه منك، والماتش اللي جاي.',
  'start.begin': 'يلا نبدأ',

  'masthead.round': 'الجولة',

  'dash.decision': 'قرار النهاردة',
  'dash.decision.table': 'الترتيب دلوقتي',
  'dash.play': 'جهّز الماتش',

  'dash.since': 'من آخر مرة بصيت',
  'dash.since.matches': 'ماتشات اتلعبت في الدوري',
  'dash.since.yours': 'ماتشاتك',
  'dash.since.position': 'مركزك',
  'dash.since.points': 'نقطك',

  'dash.onTrack': 'ماشي صح ولا لأ',
  'dash.onTrack.position': 'مركزك',
  'dash.onTrack.line': 'المجلس عايزك فين',
  'dash.onTrack.rival': 'الفرق بينك وبين',
  'dash.onTrack.games': 'ماتشات فاضلة',
  'dash.onTrack.available': 'نقط لسه تقدر تاخدها',
  'dash.outlook.certain': 'مضمون',
  'dash.outlook.undecided': 'لسه مفتوح',
  'dash.outlook.impossible': 'خلاص راح',
  'dash.outlook.why.certain': 'حتى لو خسرت اللي فاضل كله وهو كسب كله، مش هيلحقك. دي حسبة، مش توقع.',
  'dash.outlook.why.undecided':
    'الحسبة لوحدها مش بتحسمها، يبقى إحنا كمان مش هنحسمها. اللي تحت هو اللي معانا.',
  'dash.outlook.why.impossible': 'حتى لو كسبت اللي فاضل كله، النقط مش هتوصّلك. دي حسبة، مش رأي.',

  'dash.risk': 'أكبر خطر عليك',
  'dash.risk.sack.at_risk': 'المجلس وصل للحد اللي قاله',
  'dash.risk.sack.warned': 'فاضل كسبة واحدة على الحد اللي المجلس قاله',
  'dash.risk.sack.untilImpossible': 'المجلس قال إنه هيتحرك لما المطلوب يبقى مستحيل بالحسبة.',
  'dash.risk.sack.adriftBy': 'المجلس حدّد بُعد معيّن عن الخط، وماتش يبدأ يحسب منه.',
  'dash.risk.sack.threshold': 'الحد اللي المجلس بيتحرك عنده',
  'dash.risk.sack.fromGame': 'بيبدأ يحسب من ماتش',
  'dash.risk.adrift': 'بعيد عن الخط بـ',
  'dash.risk.slack': 'اللي لسه تقدر تفرّط فيه',
  'dash.risk.beforeWindow': 'ماتشات قبل ما المجلس يبص',
  'dash.risk.pace.yours': 'معدلك',
  'dash.risk.pace.chasing': 'معدل اللي قدامك',
  'dash.risk.pace.chased': 'معدل اللي وراك',
  'dash.risk.pace.behind': 'ناقصك في الماتش',
  'dash.risk.pace.window': 'متحسب على آخر كام ماتش',
  'dash.risk.pace.why': 'الرقمين معدودين من نفس عدد الماتشات. مفيش توقع هنا.',

  'dash.assistant': 'مساعدك بيقول إيه',
  'dash.assistant.cost': 'كلّفك',
  'dash.assistant.matches': 'في كام ماتش',
  'dash.assistant.read': 'اتقرا من كام ماتش',
  'dash.assistant.evidence': 'الدقايق',
  'dash.assistant.counted': 'ده متحسب من سجل ماتشاتك نفسها. السبب طالع من الماتش، ومحدش كتبه لك.',

  'setup.title': 'الماتش الجاي',
  'setup.yourClub': 'فريقك',
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
    'الخصم بيبدأ بتشكيل عادي وكل الدوايير في النص، وعنده مدرب على الخط: لو اتأخر هيفتح، ولو مكسّب هيقفل، وهيغيّر اللي تعب. بيشوف النتيجة والوقت ولاعيبته بس — مش شايف حاجة إنت شايفها.',
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
  'result.you': 'إنت',
  'result.them': 'هما',
  'result.record': 'سجّل النتيجة وكمّل',
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
