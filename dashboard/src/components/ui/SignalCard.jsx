import React from 'react';
import Card from './Card.jsx';
import Sparkline from './Sparkline.jsx';
import { TONE_CLASSES } from '../../lib/status.js';

/**
 * Plain-language signal card for the early-warning readout. The verdict word is
 * the hero (colour-coded by tone); a one-line meaning sits under it; the raw
 * technical figure is demoted to small print for officers. Optional
 * sparkline for series-backed signals.
 *
 * Props:
 *   label     what this signal is, in plain words (e.g. "Rainfall right now")
 *   verdict   the plain verdict word (e.g. "Normal", "~12 weeks")
 *   tone      green|amber|red|accent|neutral
 *   meaning   one-line plain explanation
 *   figure    small technical figure for credibility (e.g. "SPI +0.33")
 *   spark / sparkColor  optional sparkline
 */
export default function SignalCard({ label, verdict, tone = 'neutral', meaning, figure, spark, sparkColor }) {
  const c = TONE_CLASSES[tone] || TONE_CLASSES.neutral;
  return (
    <Card className="flex flex-col justify-between gap-4 overflow-hidden p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 flex-none rounded-full ${c.dot}`} aria-hidden="true" />
          <p className="text-caption font-semibold uppercase tracking-wide text-muted">{label}</p>
        </div>
        <p className={`font-display text-section-title font-medium leading-tight ${c.text}`}>
          {verdict}
        </p>
        {meaning && <p className="text-small text-secondary">{meaning}</p>}
      </div>
      <div className="flex items-end justify-between gap-3">
        {figure ? (
          <p className="tabular text-caption text-muted">{figure}</p>
        ) : (
          <span />
        )}
        {spark && <Sparkline data={spark} color={sparkColor} width={96} height={30} />}
      </div>
    </Card>
  );
}
