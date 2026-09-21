import { causeLabel, causeLesson } from '@dakka/ai';
import type { Outlook, Standing } from '@dakka/board';
import type { Club, ClubId } from '@dakka/engine';
import {
  dashboard,
  tiles,
  type Career,
  type Dashboard,
  type PaceRisk,
  type Question,
  type Risk,
} from '@dakka/dashboard';
import type { ReactNode } from 'react';
import type { MessageKey } from '../i18n/index.js';
import { useLocale, useT } from '../i18n/context.js';
import { FixtureBar } from '../components/FixtureBar.js';
import { dataBySlug, type BrowserLeague } from '../data/league.js';
import { dec, int, signed } from '../format.js';

/**
 * The five questions, in the order blueprint §6 asks them — and only the ones with an answer.
 *
 * The rule this screen is built around is the one DESIGN.md §1.4 states and §6 repeats: **no tile
 * exists to fill space.** So the layout does not decide what to draw. `tiles()` does, from the
 * career, and a question the numbers cannot answer is simply not here — no empty state, no "no data
 * yet" card, and above all no skeleton shaped like content, which is a fabricated statistic wearing
 * a different costume.
 *
 * Nothing on this screen is worded by a model. The assistant's tile picks its subject by counting
 * the manager's own traces and names it from the closed phrasing table, which is the product's
 * second rule in its smallest form: code decides, language only says.
 */

/** Every branch that picks a string picks it from a closed map, so a new case is a build error. */
const OUTLOOK_KEY: Record<Outlook, MessageKey> = {
  certain: 'dash.outlook.certain',
  undecided: 'dash.outlook.undecided',
  impossible: 'dash.outlook.impossible',
};
const OUTLOOK_WHY: Record<Outlook, MessageKey> = {
  certain: 'dash.outlook.why.certain',
  undecided: 'dash.outlook.why.undecided',
  impossible: 'dash.outlook.why.impossible',
};
const PACE_KEY: Record<PaceRisk['against']['kind'], MessageKey> = {
  chasing: 'dash.risk.pace.chasing',
  chased: 'dash.risk.pace.chased',
};
const SACK_KEY: Record<Exclude<Standing, 'safe'>, MessageKey> = {
  warned: 'dash.risk.sack.warned',
  at_risk: 'dash.risk.sack.at_risk',
};

function clubById(league: BrowserLeague, id: ClubId): Club {
  const club = league.clubs.find((entry) => entry.id === id);
  if (club === undefined) throw new Error(`no club in this league with id ${id}`);
  return club;
}

/** A labelled figure. The label carries the words; the number is its own isolated element. */
function Fact({
  label,
  note,
  value,
  tone,
}: {
  readonly label: string;
  readonly note?: string | undefined;
  readonly value: string;
  readonly tone?: 'red' | 'green' | undefined;
}) {
  const colour = tone === 'red' ? 'text-red' : tone === 'green' ? 'text-green' : '';
  return (
    <div className="row">
      <span className="flex-1 text-small">
        <span className="block">{label}</span>
        {note !== undefined && <span className="block label">{note}</span>}
      </span>
      <span className={`num text-figure font-bold ${colour}`}>{value}</span>
    </div>
  );
}

function Section({
  head,
  note,
  children,
}: {
  readonly head: string;
  readonly note?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <section>
      <p className="head">
        <span>{head}</span>
        {note !== undefined && <span className="text-faint font-normal">{note}</span>}
      </p>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------------------------------ */

function Decision({
  league,
  club,
  view,
}: {
  readonly league: BrowserLeague;
  readonly club: ClubId;
  readonly view: Extract<Dashboard['decision'], { answered: true }>['value'];
}) {
  const t = useT();
  const you = clubById(league, club);
  const them = clubById(league, view.opponent);
  const atHome = view.venue === 'home';
  const side = (club: Club) => {
    const data = dataBySlug(league, club.slug);
    return { club, kit: data.kit, region: data.region };
  };

  return (
    <Section head={t('dash.decision')}>
      <div className="-mx-4 md:-mx-6 mb-3">
        <FixtureBar
          home={side(atHome ? you : them)}
          away={side(atHome ? them : you)}
          standing={
            <span className="text-label font-bold leading-tight">
              {t(atHome ? 'setup.venue.home' : 'setup.venue.away')}
            </span>
          }
        />
      </div>
      {view.standing !== undefined && (
        <>
          <p className="label m-0 mb-1">{t('dash.decision.table')}</p>
          <Fact label={you.shortName} value={int(view.standing.you.position)} />
          <Fact label={them.shortName} value={int(view.standing.opponent.position)} />
        </>
      )}
    </Section>
  );
}

function Since({
  league,
  club,
  view,
}: {
  readonly league: BrowserLeague;
  readonly club: ClubId;
  readonly view: Extract<Dashboard['since'], { answered: true }>['value'];
}) {
  const t = useT();
  return (
    <Section head={t('dash.since')}>
      <Fact label={t('dash.since.matches')} value={int(view.matchesPlayed)} />
      {/*
        A progression, not a pairing that follows the page: `20 → 14` reads the same way in both
        locales, so the whole expression is isolated rather than each number on its own.
      */}
      <Fact
        label={t('dash.since.position')}
        value={`${int(view.positionBefore)} → ${int(view.positionNow)}`}
      />
      <Fact
        label={t('dash.since.points')}
        value={`${int(view.pointsBefore)} → ${int(view.pointsNow)}`}
      />
      {view.yours.length > 0 && (
        <>
          <p className="label m-0 mt-3 mb-1">{t('dash.since.yours')}</p>
          {view.yours.map((result) => {
            const atHome = result.home === club;
            const mine = atHome ? result.homeGoals : result.awayGoals;
            const theirs = atHome ? result.awayGoals : result.homeGoals;
            return (
              <Fact
                key={`${result.round}-${result.home}`}
                label={clubById(league, atHome ? result.away : result.home).shortName}
                note={t(atHome ? 'setup.venue.home' : 'setup.venue.away')}
                value={`${int(mine)}-${int(theirs)}`}
              />
            );
          })}
        </>
      )}
    </Section>
  );
}

function OnTrack({
  league,
  view,
}: {
  readonly league: BrowserLeague;
  readonly view: Extract<Dashboard['onTrack'], { answered: true }>['value'];
}) {
  const t = useT();
  return (
    <Section head={t('dash.onTrack')}>
      {/* The outlook is a word, and the line under it is what the word rests on. There is no bar
          here and no percentage: two of the three words are arithmetic proofs, and the third
          says so. */}
      <p className="reversed inline-block text-label font-bold px-2 py-1 m-0">
        {t(OUTLOOK_KEY[view.outlook])}
      </p>
      <p className="text-small text-ink-soft mt-2 mb-3">{t(OUTLOOK_WHY[view.outlook])}</p>
      <Fact label={t('dash.onTrack.position')} value={int(view.position)} />
      <Fact label={t('dash.onTrack.line')} value={int(view.line)} />
      {view.rival !== undefined && (
        <Fact
          label={t('dash.onTrack.rival')}
          note={clubById(league, view.rival).shortName}
          value={signed(view.margin, 0)}
          tone={view.margin >= 0 ? 'green' : 'red'}
        />
      )}
      <Fact label={t('dash.onTrack.games')} value={int(view.gamesRemaining)} />
      <Fact label={t('dash.onTrack.available')} value={int(view.available)} />
    </Section>
  );
}

function RiskTile({ league, risk }: { readonly league: BrowserLeague; readonly risk: Risk }) {
  const t = useT();
  if (risk.kind === 'sack') {
    return (
      <Section head={t('dash.risk')}>
        <p className="text-small font-semibold m-0">{t(SACK_KEY[risk.standing])}</p>
        <p className="text-small text-ink-soft mt-1 mb-3">
          {t(
            risk.patience.kind === 'until_impossible'
              ? 'dash.risk.sack.untilImpossible'
              : 'dash.risk.sack.adriftBy',
          )}
        </p>
        {risk.patience.kind === 'adrift_by' && (
          <>
            <Fact label={t('dash.risk.sack.threshold')} value={int(risk.patience.points)} />
            <Fact label={t('dash.risk.sack.fromGame')} value={int(risk.patience.afterGames)} />
          </>
        )}
        <Fact label={t('dash.risk.adrift')} value={int(risk.adrift)} />
        <Fact
          label={t('dash.risk.slack')}
          value={signed(risk.slack, 0)}
          tone={risk.slack >= 0 ? undefined : 'red'}
        />
        {risk.gamesBeforeWindow > 0 && (
          <Fact label={t('dash.risk.beforeWindow')} value={int(risk.gamesBeforeWindow)} />
        )}
      </Section>
    );
  }

  return (
    <Section head={t('dash.risk')}>
      <Fact label={t('dash.risk.pace.yours')} value={dec(risk.yours, 2)} />
      <Fact
        label={t(PACE_KEY[risk.against.kind])}
        note={clubById(league, risk.against.club).shortName}
        value={dec(risk.against.perGame, 2)}
      />
      <Fact label={t('dash.risk.pace.behind')} value={signed(-risk.behindBy, 2)} tone="red" />
      <Fact label={t('dash.risk.pace.window')} value={int(risk.window)} />
      <p className="text-small text-ink-soft mt-3 mb-0">{t('dash.risk.pace.why')}</p>
    </Section>
  );
}

function Assistant({
  view,
}: {
  readonly view: Extract<Dashboard['assistant'], { answered: true }>['value'];
}) {
  const { locale, t } = useLocale();
  const lesson = causeLesson(view.cause, locale);
  return (
    <Section head={t('dash.assistant')}>
      <p className="text-body font-semibold m-0">{causeLabel(view.cause, locale)}</p>
      {lesson !== undefined && <p className="text-small text-ink-soft mt-1 mb-3">{lesson}</p>}
      <Fact label={t('dash.assistant.cost')} value={signed(view.cost, 2)} tone="red" />
      <Fact label={t('dash.assistant.matches')} value={int(view.matches)} />
      <Fact label={t('dash.assistant.read')} value={int(view.matchesRead)} />
      <p className="label m-0 mt-3 mb-1">{t('dash.assistant.evidence')}</p>
      <div className="flex flex-wrap gap-2">
        {view.occurrences.map((where) => (
          <span key={`${where.round}-${where.minute}`} className="minute">
            {int(where.minute)}
          </span>
        ))}
      </div>
      <p className="text-small text-ink-soft mt-3 mb-0">{t('dash.assistant.counted')}</p>
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------ */

export function DashboardScreen({
  league,
  career,
  onPlay,
}: {
  readonly league: BrowserLeague;
  readonly career: Career;
  readonly onPlay: () => void;
}) {
  const t = useT();
  const view = dashboard(career);
  const drawn = tiles(view);

  const tile = (question: Question) => {
    switch (question) {
      case 'decision':
        return view.decision.answered ? (
          <Decision league={league} club={career.club} view={view.decision.value} />
        ) : null;
      case 'since':
        return view.since.answered ? (
          <Since league={league} club={career.club} view={view.since.value} />
        ) : null;
      case 'onTrack':
        return view.onTrack.answered ? <OnTrack league={league} view={view.onTrack.value} /> : null;
      case 'risk':
        return view.risk.answered ? <RiskTile league={league} risk={view.risk.value} /> : null;
      case 'assistant':
        return view.assistant.answered ? <Assistant view={view.assistant.value} /> : null;
    }
  };

  return (
    <div className="grid gap-6">
      {drawn.map((question) => (
        <div key={question} data-tile={question}>
          {tile(question)}
        </div>
      ))}

      {/* The one action, at the bottom, belonging to the one section allowed to ask for a decision.
          Nothing to play means no button — a disabled red block is still a red block. */}
      {view.decision.answered && (
        <button type="button" className="action" onClick={onPlay}>
          {t('dash.play')}
        </button>
      )}
    </div>
  );
}
