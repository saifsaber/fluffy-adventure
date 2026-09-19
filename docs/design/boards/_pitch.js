// Shared geometry and content so the three boards differ in art direction only, never in what they show.
// Names are real: the XI is what `baselineTactics` actually picks for مطوبس.
window.XI = [
  { n: 1, name: 'قنديل', pos: 'GK', x: 50, y: 91 },
  { n: 2, name: 'بدوي', pos: 'RB', x: 17, y: 74 },
  { n: 5, name: 'قابيل', pos: 'CB', x: 38, y: 78 },
  { n: 4, name: 'السقا', pos: 'CB', x: 62, y: 78 },
  { n: 3, name: 'العجمي', pos: 'LB', x: 83, y: 74 },
  { n: 7, name: 'نصار', pos: 'RM', x: 16, y: 50 },
  { n: 6, name: 'الشناوي', pos: 'CM', x: 38, y: 55 },
  { n: 8, name: 'هلال', pos: 'CM', x: 62, y: 55 },
  { n: 11, name: 'الشاذلي', pos: 'LM', x: 84, y: 50 },
  { n: 9, name: 'الديب', pos: 'ST', x: 38, y: 28 },
  { n: 10, name: 'رزق', pos: 'ST', x: 62, y: 28 },
];
// The opponent's shape, shown as presence rather than as players we do not scout.
window.THEM = [
  { x: 50, y: 8 }, { x: 20, y: 18 }, { x: 40, y: 15 }, { x: 60, y: 15 }, { x: 80, y: 18 },
  { x: 30, y: 33 }, { x: 50, y: 36 }, { x: 70, y: 33 },
  { x: 22, y: 46 }, { x: 50, y: 44 }, { x: 78, y: 46 },
];
window.EVENTS = [
  { m: 67, kind: 'call', text: 'غيّرت الأسلوب لـ هجومي' },
  { m: 61, kind: 'goal', text: 'رزق — جول', delta: '+0.42' },
  { m: 57, kind: 'swing', text: 'الجول شال الفريق', delta: '-0.02' },
  { m: 44, kind: 'swing', text: 'ضيّعوا اللي جالهم', delta: '-0.05' },
  { m: 31, kind: 'swing', text: 'الخط العالي اتاكل سرعة', delta: '-0.13' },
];
/** Pitch markings, drawn once. Physical space — never mirrored by locale. */
window.pitchSvg = (line, fill, opts = {}) => `
<svg viewBox="0 0 100 150" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">
  <rect x="0" y="0" width="100" height="150" fill="${fill}"/>
  ${opts.stripes ? [...Array(8)].map((_, i) => i % 2 ? `<rect x="0" y="${i * 18.75}" width="100" height="18.75" fill="rgba(255,255,255,.035)"/>` : '').join('') : ''}
  <g fill="none" stroke="${line}" stroke-width="${opts.w || 0.5}" opacity="${opts.o || 0.7}">
    <rect x="3" y="3" width="94" height="144"/>
    <line x1="3" y1="75" x2="97" y2="75"/>
    <circle cx="50" cy="75" r="14"/>
    <rect x="24" y="3" width="52" height="24"/>
    <rect x="38" y="3" width="24" height="10"/>
    <rect x="24" y="123" width="52" height="24"/>
    <rect x="38" y="137" width="24" height="10"/>
    <path d="M3 9 A6 6 0 0 0 9 3"/><path d="M91 3 A6 6 0 0 0 97 9"/>
    <path d="M3 141 A6 6 0 0 1 9 147"/><path d="M91 147 A6 6 0 0 1 97 141"/>
  </g>
  <circle cx="50" cy="75" r="1" fill="${line}" opacity="${opts.o || 0.7}"/>
  <circle cx="50" cy="19" r="1" fill="${line}" opacity="${opts.o || 0.7}"/>
  <circle cx="50" cy="131" r="1" fill="${line}" opacity="${opts.o || 0.7}"/>
</svg>`;
