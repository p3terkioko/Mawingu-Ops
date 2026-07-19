import React, { useState } from 'react';
import axios from 'axios';
import Card from './ui/Card.jsx';
import Button from './ui/Button.jsx';
import Field from './ui/Field.jsx';
import SegmentedControl from './ui/SegmentedControl.jsx';
import Icon from './ui/Icon.jsx';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const T = {
  sw: {
    title: 'Pokea ushauri kila wiki',
    hint: 'Kwa SMS au barua pepe — bila malipo.',
    channel: 'Njia ya kupokea',
    sms: 'SMS',
    email: 'Barua pepe',
    labelSms: 'Nambari ya simu',
    labelEmail: 'Barua pepe',
    placeholderSms: 'mf. +2547XXXXXXXX',
    placeholderEmail: 'mf. jina@mfano.com',
    button: 'Jiunge',
    sending: 'Inatuma…',
    success: 'Umejiunga! Utapokea ushauri kila wiki.',
    error: 'Imeshindikana. Hakikisha mawasiliano ni sahihi.',
  },
  en: {
    title: 'Get the advisory every week',
    hint: 'By SMS or email — free.',
    channel: 'Delivery channel',
    sms: 'SMS',
    email: 'Email',
    labelSms: 'Phone number',
    labelEmail: 'Email address',
    placeholderSms: 'e.g. +2547XXXXXXXX',
    placeholderEmail: 'e.g. name@example.com',
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

  const isEmail = channel === 'email';

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-control bg-surface-2 text-accent">
          <Icon name="bell" size={20} />
        </span>
        <div>
          <h2 className="font-display text-card-title font-medium text-primary">{t.title}</h2>
          <p className="text-small text-secondary">{t.hint}</p>
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-small font-medium text-secondary">{t.channel}</span>
          <SegmentedControl
            ariaLabel={t.channel}
            options={[
              { value: 'sms', label: t.sms },
              { value: 'email', label: t.email },
            ]}
            value={channel}
            onChange={setChannel}
          />
        </div>

        <Field
          label={isEmail ? t.labelEmail : t.labelSms}
          type={isEmail ? 'email' : 'tel'}
          inputMode={isEmail ? 'email' : 'tel'}
          required
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={isEmail ? t.placeholderEmail : t.placeholderSms}
        />

        <Button type="submit" disabled={state === 'sending'}>
          {state === 'sending' ? t.sending : t.button}
        </Button>
      </form>

      {state === 'done' && (
        <p className="flex items-center gap-2 text-small font-semibold text-status-green">
          <Icon name="check" size={18} /> {t.success}
        </p>
      )}
      {state === 'error' && <p className="text-small font-semibold text-status-red">{t.error}</p>}
    </Card>
  );
}
