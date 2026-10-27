import { useState } from 'react';
import { useRoom } from '../../../hooks/useRoom.js';
import { Avatar } from '../../../components/common/Avatar.jsx';
import { GameHud, TurnBanner } from '../shared/components.jsx';
import { usePlayers } from '../shared/usePlayers.js';
import { Card, CardBack, COLOR_NAMES, cardLabel } from './Card.jsx';
import './View.css';

const isWild = (card) => card.value === 'wild' || card.value === 'wild4';

function ColourChooser({ card, onPick, onCancel }) {
  return (
    <div className="uno-chooser card-sticker" role="group" aria-label={`Choose a colour for your ${cardLabel(card)}`}>
      <p className="uno-chooser-title">Pick the new colour</p>
      <div className="uno-chooser-grid">
        {Object.entries(COLOR_NAMES).map(([color, label]) => (
          <button key={color} className={`uno-swatch uno-card-${color}`} onClick={() => onPick(color)}>{label}</button>
        ))}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={onCancel}>Never mind</button>
    </div>
  );
}

function Opponent({ p, current, catchable, canCatch, onCatch }) {
  const { byId } = usePlayers();
  const who = byId(p.id);
  const fan = Math.min(p.cardCount, 8);
  return (
    <li className={`uno-opp ${current ? 'uno-opp-turn' : ''} ${p.left ? 'uno-opp-left' : ''}`}>
      <div className="uno-opp-head">
        <Avatar player={who} size={34} ring={current} />
        <span className="uno-opp-name">{who.name}</span>
      </div>
      <div className="uno-fan" aria-hidden="true">
        {Array.from({ length: fan }, (_, i) => <span key={i} className="uno-fan-card" style={{ '--i': i, '--n': fan }}><CardBack size="xs" /></span>)}
      </div>
      <p className="uno-opp-meta">
        <span className="numeric">{p.cardCount}</span> card{p.cardCount === 1 ? '' : 's'}
        {current && <span className="badge badge-cream">Playing</span>}
        {p.calledUno && p.cardCount <= 2 && <span className="badge badge-gulal">UNO!</span>}
        {p.left && <span className="badge badge-outline">Left</span>}
        {!p.left && !who.connected && <span className="badge badge-outline">Away</span>}
      </p>
      {catchable && canCatch && (
        <button className="btn btn-primary btn-sm uno-catch" onClick={onCatch}>Catch! 🚨 <span className="sr-only">{who.name} forgot to call uno</span></button>
      )}
    </li>
  );
}

export default function ColourClashView({ game }) {
  const { act, state } = useRoom();
  const { meId, nameOf } = usePlayers();
  const [choosing, setChoosing] = useState(null); // wild card awaiting a colour
  const v = game.view;
  const playing = !game.spectating;
  const me = v.players.find((p) => p.id === meId);
  const opponents = v.players.filter((p) => p.id !== meId);
  const pendingCard = v.pendingCardId ? v.myHand.find((c) => c.id === v.pendingCardId) : null;
  const iAmCatchable = v.catchableIds.includes(meId);
  // Drop a half-made wild choice if the turn moved on (e.g. the timer ran out).
  const choice = v.myTurn && choosing && v.myHand.some((c) => c.id === choosing.id) ? choosing : null;

  const play = (card) => {
    if (isWild(card)) return setChoosing(card);
    setChoosing(null);
    act('play', { cardId: card.id });
  };
  const playWild = (color) => {
    const card = choice;
    setChoosing(null);
    if (!card) return;
    act('play', { cardId: card.id, color });
  };

  return (
    <div className="uno stack" style={{ '--gap': '18px' }}>
      <GameHud kicker={`${v.players.filter((p) => !p.left).length} players · ${v.direction === 1 ? '↻ clockwise' : '↺ reversed'}`} title={v.myTurn ? 'Your turn, superstar!' : 'Colour Clash'} deadline={game.deadline} total={state.room.settings.turnSeconds} />

      <ul className="uno-opps" aria-label="Opponents">
        {opponents.map((p) => (
          <Opponent key={p.id} p={p} current={p.id === v.currentPlayerId} catchable={v.catchableIds.includes(p.id)} canCatch={playing} onCatch={() => act('catch', { targetId: p.id })} />
        ))}
      </ul>

      <section className={`uno-table uno-table-${v.currentColor}`} aria-label="Table">
        <div className="uno-pile">
          <button
            className="uno-draw"
            onClick={() => act('draw')}
            disabled={!v.myTurn || v.pendingDraw}
            aria-label={`Draw a card. ${v.drawPileCount} left in the pile`}
          >
            <CardBack size="md" />
            <span className="uno-draw-count numeric">{v.drawPileCount}</span>
          </button>
          <span className="uno-pile-label">Draw pile</span>
        </div>

        <div className="uno-centre">
          <span className={`uno-direction ${v.direction === 1 ? '' : 'uno-direction-rev'}`} aria-hidden="true">↻</span>
          <div className="uno-pile">
            <Card key={v.topCard.id} card={v.topCard} size="lg" className="uno-top" />
            <span className="uno-pile-label">On the pile</span>
          </div>
        </div>

        <div className="uno-colour" aria-live="polite">
          <span className={`uno-colour-dot uno-card-${v.currentColor}`} aria-hidden="true" />
          <span>Colour: <strong>{COLOR_NAMES[v.currentColor]}</strong></span>
          <span className="uno-small">{v.direction === 1 ? '↻ Clockwise' : '↺ Reversed'}</span>
        </div>
      </section>

      <p className="uno-feed" aria-live="polite">📣 {v.lastAction}</p>

      {playing ? (
        <>
          <TurnBanner playerId={v.currentPlayerId} mine="Your turn, superstar! Match the colour or the symbol." theirs="{name} is thinking… get ready." />

          {iAmCatchable && <p className="uno-alert" role="alert">One card left! Call UNO before someone catches you.</p>}

          <div className="uno-actions">
            {v.canCallUno && <button className="btn btn-primary btn-lg uno-call" onClick={() => act('callUno')}>Call UNO! 📢</button>}
            {me?.calledUno && me.cardCount <= 2 && <span className="badge badge-gulal">You called UNO</span>}
            {v.myTurn && !v.pendingDraw && !v.myHand.some((c) => c.playable) && (
              <button className="btn btn-marigold" onClick={() => act('draw')}>Nothing to play · Draw a card</button>
            )}
            {v.myTurn && !v.pendingDraw && v.myHand.some((c) => c.playable) && (
              <button className="btn btn-ghost" onClick={() => act('draw')}>Draw instead</button>
            )}
          </div>

          {pendingCard && !choice && (
            <div className="uno-pending card-sticker" aria-live="polite">
              <Card card={pendingCard} size="md" />
              <div className="stack" style={{ '--gap': '10px' }}>
                <p className="uno-chooser-title">You drew a playable card!</p>
                <div className="row">
                  <button className="btn btn-parrot" onClick={() => play(pendingCard)}>Play it</button>
                  <button className="btn btn-cream" onClick={() => act('pass')}>Keep it</button>
                </div>
              </div>
            </div>
          )}

          {choice && <ColourChooser card={choice} onPick={playWild} onCancel={() => setChoosing(null)} />}

          <section className="uno-hand-wrap" aria-label={`Your hand, ${v.myHand.length} cards`}>
            <p className="eyebrow">Your hand · {v.myHand.length} card{v.myHand.length === 1 ? '' : 's'}</p>
            <ul className="uno-hand">
              {v.myHand.map((card, i) => (
                <li key={card.id} className="uno-hand-slot" style={{ '--i': i, '--n': v.myHand.length }}>
                  <Card
                    as="button"
                    card={card}
                    size="md"
                    className={card.playable ? 'uno-playable' : 'uno-dim'}
                    disabled={!card.playable}
                    aria-pressed={choice?.id === card.id}
                    onClick={() => play(card)}
                  />
                </li>
              ))}
            </ul>
            {!v.myTurn && <p className="uno-small">Cards light up when it's your turn.</p>}
          </section>
        </>
      ) : (
        <p className="uno-feed">👀 You're watching. It's {nameOf(v.currentPlayerId)}'s turn.</p>
      )}
    </div>
  );
}
