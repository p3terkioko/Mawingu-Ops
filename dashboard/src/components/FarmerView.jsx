import React from 'react';
import Card from './ui/Card.jsx';
import StatusHero from './ui/StatusHero.jsx';
import SegmentedControl from './ui/SegmentedControl.jsx';
import SubscribeForm from './SubscribeForm.jsx';
import Icon from './ui/Icon.jsx';
import { getStatus } from '../lib/status.js';

/**
 * Farmer-facing Advisory — the light, high-contrast variant (feature phones,
 * bright daylight). A centered single column: the status hero, the advisory
 * prose, the USSD hint, and the subscribe card. Branches on
 * planting_recommendations.phase — the same rule as USSD and SMS — so every
 * channel shows the same decision.
 */
const T = {
  sw: {
    heading: 'Ushauri wa wiki hii — mahindi, Machakos',
    confidence: 'Uhakika',
    noAdvisory: 'Hakuna ushauri kwa sasa. Jaribu tena baadaye.',
    ussdTitle: 'Kwenye simu ya kawaida',
    ussd: 'Piga *384# kwa simu yoyote kupata ushauri huu.',
    language: 'Lugha',
  },
  en: {
    heading: "This week's advisory — maize, Machakos",
    confidence: 'Confidence',
    noAdvisory: 'No advisory available yet. Please try again later.',
    ussdTitle: 'On any basic phone',
    ussd: 'Dial *384# on any phone to get this advisory.',
    language: 'Language',
  },
};

export default function FarmerView({ status, language, onLanguageChange }) {
  const t = T[language] || T.sw;
  const rec = status?.recommendation;
  const st = getStatus({ recommendation: rec?.recommendation, phase: rec?.phase, language });
  const offSeason = rec?.phase === 'off_season';
  const advisoryText = status?.advisory?.[language] || status?.advisory?.sw;

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      {/* Language toggle — the shared control, on the header row. */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-caption font-semibold uppercase tracking-wide text-muted">
          {t.language}
        </span>
        <SegmentedControl
          ariaLabel={t.language}
          options={[
            { value: 'sw', label: 'Kiswahili' },
            { value: 'en', label: 'English' },
          ]}
          value={language}
          onChange={onLanguageChange}
        />
      </div>

      <StatusHero tone={st.tone} eyebrow={t.heading} word={st.word} summary={st.summary} />

      {/* Two columns so the page fills the width: advisory prose + USSD on the
          left, subscribe on the right. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="flex flex-col gap-4 p-6">
            <p className="text-caption font-semibold uppercase tracking-wide text-muted">
              {t.heading}
            </p>
            <p className="text-body-lg leading-relaxed text-primary">
              {advisoryText || t.noAdvisory}
            </p>
            {!offSeason && rec?.confidence != null && (
              <p className="text-small text-secondary">
                {t.confidence}:{' '}
                <span className="font-semibold text-primary">{Math.round(rec.confidence)}%</span>
              </p>
            )}
          </Card>

          {/* USSD hint. */}
          <Card className="flex items-center gap-4 p-6">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-control bg-surface-2 text-accent">
              <Icon name="advisory" size={24} />
            </span>
            <div>
              <p className="text-caption font-semibold uppercase tracking-wide text-muted">
                {t.ussdTitle}
              </p>
              <p className="text-body-lg text-primary">{t.ussd}</p>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <SubscribeForm language={language} />
        </div>
      </div>
    </div>
  );
}
