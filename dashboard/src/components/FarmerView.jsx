import React from 'react';
import AlertBadge from './AlertBadge.jsx';
import SubscribeForm from './SubscribeForm.jsx';

/**
 * Farmer-facing view: the advisory in large type with a language toggle, the
 * action (or PREPARE) headline, and a subscribe form. Designed to be legible
 * on a 375px-wide phone. Branches on planting_recommendations.phase — same
 * rule as USSD and SMS — so every channel shows the same decision.
 */
const REC_LABELS = {
  sw: { PLANT_NOW: 'PANDA SASA', WAIT: 'SUBIRI', DO_NOT_PLANT: 'USIPANDE', PREPARE: 'ANDAA SHAMBA' },
  en: { PLANT_NOW: 'PLANT NOW', WAIT: 'WAIT', DO_NOT_PLANT: 'DO NOT PLANT', PREPARE: 'PREPARE' },
};

const REC_COLOR = {
  PLANT_NOW: 'text-green-600',
  WAIT: 'text-yellow-600',
  DO_NOT_PLANT: 'text-red-600',
  PREPARE: 'text-sky-600',
};

const T = {
  sw: {
    heading: 'Ushauri wa wiki hii — mahindi, Machakos',
    confidence: 'Uhakika',
    noAdvisory: 'Hakuna ushauri kwa sasa. Jaribu tena baadaye.',
    ussd: 'Piga *384# kwa simu yoyote kupata ushauri huu.',
  },
  en: {
    heading: "This week's advisory — maize, Machakos",
    confidence: 'Confidence',
    noAdvisory: 'No advisory available yet. Please try again later.',
    ussd: 'Dial *384# on any phone to get this advisory.',
  },
};

export default function FarmerView({ status, language, onLanguageChange }) {
  const t = T[language] || T.sw;
  const rec = status?.recommendation;
  const offSeason = rec?.phase === 'off_season';
  const key = offSeason ? 'PREPARE' : rec?.recommendation;
  const label = (REC_LABELS[language] || REC_LABELS.sw)[key] || key || '—';
  const color = REC_COLOR[key] || 'text-slate-600';
  const advisoryText = status?.advisory?.[language] || status?.advisory?.sw;

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      {/* Language toggle — a real control, not a footnote. */}
      <div className="flex justify-center gap-2">
        {[
          { code: 'sw', name: 'Kiswahili' },
          { code: 'en', name: 'English' },
        ].map(({ code, name }) => (
          <button
            key={code}
            onClick={() => onLanguageChange(code)}
            className={`px-5 py-2 rounded-full text-sm font-semibold border ${
              language === code
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-300'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-white shadow-md p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-slate-500">{t.heading}</p>
          <AlertBadge alertLevel={status?.alert?.level} />
        </div>

        <h1 className={`text-4xl font-extrabold ${color}`}>{label}</h1>

        <p className="text-xl leading-relaxed text-slate-800">
          {advisoryText || t.noAdvisory}
        </p>

        {!offSeason && rec?.confidence != null && (
          <p className="text-sm text-slate-500">
            {t.confidence}: <span className="font-semibold">{Math.round(rec.confidence)}%</span>
          </p>
        )}

        <p className="text-sm text-slate-500 border-t pt-3">{t.ussd}</p>
      </div>

      <SubscribeForm language={language} />
    </div>
  );
}
