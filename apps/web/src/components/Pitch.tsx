import type { Club, Selection } from '@dakka/engine';
import { readableOn, type Kit } from '@dakka/content/pure';
import { placeXI } from '../pitch.js';

/**
 * The pitch, printed as a two-colour diagram (DESIGN.md §5).
 *
 * Drawn as one SVG rather than positioned boxes, for two reasons that both matter here. A pitch is
 * geometry, so its coordinates are genuinely physical — `left` and `top` inside a diagram are not
 * the physical-direction bug §6 bans, they are the only honest way to say where a player stands —
 * and an SVG keeps that out of the layout system entirely, so nothing about it flips with the
 * locale. A pitch is a pitch in both.
 *
 * The markings are the real ones, in metres on a 68×105 pitch. The alternative is a rectangle with
 * a circle in it, which reads as a logo.
 */

const W = 68;
const H = 105;
const PAD = 3;
/**
 * The canvas is taller than the pitch, by the room a keeper's name needs under his own goal line.
 * A printed diagram has a margin; cropping to the touchlines is what makes one look like a screen.
 */
const CANVAS = H + 12;

/** Pitch units (0–100) to metres on the drawing. */
const mx = (x: number): number => PAD + (x / 100) * (W - 2 * PAD);
const my = (y: number): number => PAD + (y / 100) * (H - 2 * PAD);

const LINE = { fill: 'none', stroke: 'var(--color-ink)', strokeWidth: 0.35, opacity: 0.55 };

export function Pitch({
  club,
  kit,
  startingXI,
  label,
}: {
  readonly club: Club;
  /**
   * Passed in rather than read off the club, because the engine's `Club` has no colours and must
   * not grow any: it is the type the simulation runs on, and a shirt is not an input to a match.
   * Kit lives on `ClubData`, which is the content layer's business.
   */
  readonly kit: Kit;
  readonly startingXI: readonly Selection[];
  /** What a screen reader is told this diagram is. Never "pitch" — say whose shape it is. */
  readonly label: string;
}) {
  const marks = placeXI(startingXI);
  const byId = new Map(club.squad.map((player) => [player.id, player]));
  const shirt = kit.primary;
  const ink = readableOn(shirt, ['#17140f', '#efe7d6']);

  return (
    <svg
      viewBox={`0 0 ${W} ${CANVAS}`}
      className="block w-full h-auto"
      role="img"
      aria-label={label}
      style={{ backgroundColor: 'var(--color-card)' }}
    >
      {/* Touchlines, halfway, centre circle and spot. */}
      <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} {...LINE} />
      <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} {...LINE} />
      <circle cx={W / 2} cy={H / 2} r={9.15} {...LINE} />
      <circle cx={W / 2} cy={H / 2} r={0.5} fill="var(--color-ink)" opacity={0.55} />

      {/* Penalty and goal areas at both ends, to their real proportions. */}
      {[0, 1].map((end) => {
        const near = end === 0;
        const boxY = near ? PAD : H - PAD - 16.5;
        const sixY = near ? PAD : H - PAD - 5.5;
        const spotY = near ? PAD + 11 : H - PAD - 11;
        return (
          <g key={end}>
            <rect x={(W - 40.32) / 2} y={boxY} width={40.32} height={16.5} {...LINE} />
            <rect x={(W - 18.32) / 2} y={sixY} width={18.32} height={5.5} {...LINE} />
            <circle cx={W / 2} cy={spotY} r={0.4} fill="var(--color-ink)" opacity={0.55} />
          </g>
        );
      })}

      {marks.map((mark) => {
        const player = byId.get(mark.playerId);
        const x = mx(mark.x);
        const y = my(mark.y);
        return (
          <g key={mark.playerId}>
            <rect x={x - 4.4} y={y - 3.4} width={8.8} height={6.8} rx={0.6} fill={shirt} />
            <text
              x={x}
              y={y + 1.3}
              textAnchor="middle"
              fill={ink}
              style={{ font: '600 3.4px var(--font-num)' }}
            >
              {mark.position}
            </text>
            <text
              x={x}
              y={y + 8}
              textAnchor="middle"
              fill="var(--color-ink)"
              style={{ font: '600 2.9px var(--font-ui)' }}
            >
              {player?.shortName ?? ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
