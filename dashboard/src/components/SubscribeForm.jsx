import React, { useState } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const T = {
  sw: {
    title: 'Pokea ushauri kila wiki',
    hint: 'Kwa SMS au barua pepe — bila malipo.',
    sms: 'SMS',
    email: 'Barua pepe',
    placeholderSms: 'Nambari ya simu, mf. +2547XXXXXXXX',
    placeholderEmail: 'Barua pepe, mf. jina@mfano.com',
    button: 'Jiunge',
    sending: 'Inatuma…',
    success: 'Umejiunga! Utapokea ushauri kila wiki.',
    error: 'Imeshindikana. Hakikisha mawasiliano ni sahihi.',
  },
  en: {
    title: 'Get the advisory every week',
    hint: 'By SMS or email — free.',
    sms: 'SMS',
    email: 'Email',
    placeholderSms: 'Phone number, e.g. +2547XXXXXXXX',
    placeholderEmail: 'Email, e.g. name@example.com',
    button: 'Subscribe',
    sending: 'Sending…',
    success: 'Subscribed! You will receive the advisory every week.',
    error: 'Could not subscribe. Check the contact details.',
  },
};

export default function SubscribeForm({ language = 'sw' }) {
  const t = T[language] || T.sw;
  const [channel, setChannel] = useState('sms');
  const [contact, setContact] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | done | error

  async function submit(e) {
    e.preventDefault();
    setState('sending');
    try {
      await axios.post(`${API_BASE}/api/subscribe`, { contact, channel, language });
      setState('done');
      setContact('');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="rounded-2xl bg-white shadow-md p-6">
      <h2 className="font-semibold text-slate-700">{t.title}</h2>
      <p className="text-sm text-slate-500 mb-3">{t.hint}</p>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex gap-2">
          {['sms', 'email'].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
                channel === c
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white text-slate-600 border-slate-300'
              }`}
            >
              {c === 'sms' ? t.sms : t.email}
            </button>
          ))}
        </div>
        <input
          type={channel === 'email' ? 'email' : 'tel'}
          required
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={channel === 'email' ? t.placeholderEmail : t.placeholderSms}
          className="border border-slate-300 rounded-lg px-4 py-3 text-base"
        />
        <button
          type="submit"
          disabled={state === 'sending'}
          className="bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg px-4 py-3 disabled:opacity-50"
        >
          {state === 'sending' ? t.sending : t.button}
        </button>
      </form>

      {state === 'done' && (
        <p className="mt-3 text-sm font-semibold text-green-700">{t.success}</p>
      )}
      {state === 'error' && (
        <p className="mt-3 text-sm font-semibold text-red-600">{t.error}</p>
      )}
    </div>
  );
}
