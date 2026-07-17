'use strict';

/**
 * Africa's Talking USSD webhook.
 *
 * POST /ussd
 *   Body (form-encoded): sessionId, phoneNumber, networkCode, serviceCode, text
 *
 * Responses are plain text. The first token of the body must be:
 *   "CON " — keep the session open and prompt for more input
 *   "END " — display a final message and close the session
 *
 * Session position is tracked in the ussd_sessions table. The accumulated
 * `text` field carries every input joined by '*'; we act on the latest segment.
 *
 * The canonical advisory (~260-320 chars) exceeds the 182-char page limit, so
 * long content is paginated across screens at sentence boundaries, with a
 * return-to-menu path at the end instead of a dead-end END. Pagination state
 * is encoded as 'ADVISORY_PAGE:<n>' / 'ALERT_PAGE:<n>' (n = next page index).
 */

const express = require('express');
const farmerService = require('../services/farmer');
const sessionService = require('../services/session');
const advisoryService = require('../services/advisory');
const subscriptionService = require('../services/subscriptions');

const router = express.Router();
const LOCATION = 'machakos';

// Africa's Talking hard limit per USSD page.
const MAX_USSD_LENGTH = 182;

// Localized header word for the planting decision. Off-season the raw model
// recommendation (e.g. WAIT) is NOT shown — there is no live decision; the
// header must match the advisory body, which says "prepare" (fix for the
// WAIT-header / Andaa-body contradiction).
const REC_LABELS = {
  sw: { PLANT_NOW: 'PANDA SASA', WAIT: 'SUBIRI', DO_NOT_PLANT: 'USIPANDE', PREPARE: 'ANDAA' },
  en: { PLANT_NOW: 'PLANT NOW', WAIT: 'WAIT', DO_NOT_PLANT: 'DO NOT PLANT', PREPARE: 'PREPARE' },
};

const NAV = {
  sw: { more: '0. Endelea', menu: '0. Menyu kuu' },
  en: { more: '0. More', menu: '0. Main menu' },
};

/** Return the most recent input segment from the accumulated text. */
function latestInput(text) {
  if (!text) return '';
  const parts = text.split('*');
  return parts[parts.length - 1].trim();
}

/** Truncate to the USSD character limit defensively. */
function clamp(message) {
  if (message.length <= MAX_USSD_LENGTH) return message;
  return message.slice(0, MAX_USSD_LENGTH);
}

/** Main menu text in the farmer's language. */
function mainMenu(language) {
  if (language === 'en') {
    return 'CON MawinguOps - Machakos\n1. Weather Alert\n2. Planting Advisory\n3. Subscribe to SMS Alerts\n0. Exit';
  }
  return 'CON MawinguOps - Machakos\n1. Hali ya Hewa\n2. Ushauri wa Kupanda\n3. Jiunge na Arifa za SMS\n0. Toka';
}

/**
 * Split text into pages at sentence boundaries so each page (plus its "CON "
 * prefix and nav footer) fits the USSD limit. Never splits mid-word.
 * @param {string} text      full document (may contain newlines)
 * @param {string} language  for the nav footer labels
 * @returns {string[]} page bodies (nav footers NOT included)
 */
function paginate(text, language) {
  const nav = NAV[language] || NAV.sw;
  // Budget: limit minus "CON " and the larger nav footer (+ its newline).
  const budget =
    MAX_USSD_LENGTH - 4 - Math.max(nav.more.length, nav.menu.length) - 1;

  // Sentence-ish chunks (keep trailing punctuation); newlines end a chunk too.
  const chunks = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];

  const pages = [];
  let current = '';
  for (let chunk of chunks) {
    // Normalise surrounding whitespace but preserve an intentional line break
    // (e.g. between the header line and the advisory body).
    chunk = chunk.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
    if (!chunk.endsWith('\n')) chunk += ' ';
    // A single chunk longer than the budget is hard-split at word boundaries.
    while (chunk.trim().length > budget) {
      const slice = chunk.slice(0, budget);
      const space = slice.lastIndexOf(' ');
      const head = slice.slice(0, space > 0 ? space : budget);
      if (current) {
        pages.push(current.trim());
        current = '';
      }
      pages.push(head.trim());
      chunk = chunk.slice(head.length).trimStart() + ' ';
    }
    if ((current + chunk).trim().length > budget) {
      pages.push(current.trim());
      current = chunk;
    } else {
      current += chunk;
    }
  }
  if (current.trim()) pages.push(current.trim());
  return pages.length ? pages : [text.slice(0, budget)];
}

/**
 * Build the full advisory document shown for menu option 2.
 * Branches on planting_recommendations.phase: off-season shows a PREPARE
 * header and no confidence (there is no decision to be confident about).
 */
function advisoryDocument(language, recommendation, advisory) {
  const labels = REC_LABELS[language] || REC_LABELS.sw;
  const offSeason = recommendation.phase === 'off_season';
  const key = offSeason ? 'PREPARE' : recommendation.recommendation;
  const recLabel = labels[key] || recommendation.recommendation;
  const title = language === 'en' ? 'Advisory' : 'Ushauri';

  let doc = `${title}: ${recLabel}\n${advisory.advisory_text}`;
  if (!offSeason) {
    const conf = language === 'en' ? 'Confidence' : 'Uhakika';
    const confidence = Math.round(Number(recommendation.confidence_score));
    doc += `\n${conf}: ${confidence}%`;
  }
  return doc;
}

/** Build the weather-alert document shown for menu option 1. */
function alertDocument(language, advisory) {
  const title = language === 'en' ? 'Alert' : 'Tahadhari';
  return `${title}: ${advisory.alert_level}\n${advisory.advisory_text}`;
}

/**
 * Render one page of a paginated document and set the follow-up state.
 * @returns {Promise<string>} the USSD reply
 */
async function renderPage(sessionId, kind, pages, index, language) {
  const nav = NAV[language] || NAV.sw;
  const isLast = index >= pages.length - 1;
  if (isLast) {
    await sessionService.updateSessionState(sessionId, 'POST_VIEW');
    return `CON ${pages[index]}\n${nav.menu}`;
  }
  await sessionService.updateSessionState(sessionId, `${kind}_PAGE:${index + 1}`);
  return `CON ${pages[index]}\n${nav.more}`;
}

/** Send a plain-text USSD response. */
function reply(res, message) {
  res.set('Content-Type', 'text/plain');
  res.send(clamp(message));
}

router.post('/ussd', async (req, res) => {
  const { sessionId, phoneNumber, text = '' } = req.body || {};

  if (!sessionId || !phoneNumber) {
    return reply(res, 'END Invalid request.');
  }

  try {
    let session = await sessionService.getSession(sessionId);

    // ---- First dial: no session yet -------------------------------------
    if (!session) {
      session = await sessionService.createSession(sessionId, phoneNumber);

      // Decide new vs returning based on whether the farmer already existed,
      // then create the row so onboarding steps have something to update.
      const existing = await farmerService.findFarmer(phoneNumber);
      const farmer = await farmerService.findOrCreateFarmer(phoneNumber);

      if (!existing) {
        await sessionService.updateSessionState(sessionId, 'LANGUAGE_SELECT');
        return reply(res, 'CON Karibu MawinguOps\n1. Kiswahili\n2. English');
      }

      await sessionService.updateSessionState(sessionId, 'MAIN_MENU');
      return reply(res, mainMenu(farmer.language));
    }

    const input = latestInput(text);

    // ---- LANGUAGE_SELECT -------------------------------------------------
    if (session.state === 'LANGUAGE_SELECT') {
      const language = input === '2' ? 'en' : 'sw';
      await farmerService.updateFarmerLanguage(phoneNumber, language);
      await sessionService.updateSessionState(sessionId, 'NAME_INPUT');
      const prompt =
        language === 'en'
          ? 'CON Enter your name:\n(Press 0 to skip)'
          : 'CON Ingiza jina lako:\n(Bonyeza 0 kuruka)';
      return reply(res, prompt);
    }

    // ---- NAME_INPUT ------------------------------------------------------
    if (session.state === 'NAME_INPUT') {
      if (input && input !== '0') {
        await farmerService.updateFarmerName(phoneNumber, input.slice(0, 100));
      }
      await sessionService.updateSessionState(sessionId, 'MAIN_MENU');
      const farmer = await farmerService.findOrCreateFarmer(phoneNumber);
      return reply(res, mainMenu(farmer.language));
    }

    // ---- MAIN_MENU -------------------------------------------------------
    if (session.state === 'MAIN_MENU') {
      const farmer = await farmerService.findOrCreateFarmer(phoneNumber);
      const language = farmer.language;

      // Selection 1: Weather alert
      if (input === '1') {
        const advisory = await advisoryService.getLatestAdvisory(LOCATION, language);
        if (!advisory) {
          await sessionService.deleteSession(sessionId);
          return reply(
            res,
            language === 'en'
              ? 'END No alert available yet. Please try again later.'
              : 'END Hakuna tahadhari kwa sasa. Jaribu tena baadaye.'
          );
        }

        await advisoryService.logAdvisoryDelivery(
          phoneNumber,
          'ussd',
          advisory.advisory_text,
          advisory.alert_level,
          advisory.recommendation
        );
        const pages = paginate(alertDocument(language, advisory), language);
        return reply(res, await renderPage(sessionId, 'ALERT', pages, 0, language));
      }

      // Selection 2: Planting advisory
      if (input === '2') {
        const [recommendation, advisory] = await Promise.all([
          advisoryService.getLatestRecommendation(LOCATION),
          advisoryService.getLatestAdvisory(LOCATION, language),
        ]);
        if (!recommendation || !advisory) {
          await sessionService.deleteSession(sessionId);
          return reply(
            res,
            language === 'en'
              ? 'END No advisory available yet. Please try again later.'
              : 'END Hakuna ushauri kwa sasa. Jaribu tena baadaye.'
          );
        }

        await advisoryService.logAdvisoryDelivery(
          phoneNumber,
          'ussd',
          advisory.advisory_text,
          advisory.alert_level,
          recommendation.recommendation
        );
        const pages = paginate(
          advisoryDocument(language, recommendation, advisory),
          language
        );
        return reply(res, await renderPage(sessionId, 'ADVISORY', pages, 0, language));
      }

      // Selection 3: Subscribe to weekly SMS alerts
      if (input === '3') {
        await sessionService.updateSessionState(sessionId, 'SUBSCRIBE_CONFIRM');
        return reply(
          res,
          language === 'en'
            ? 'CON Receive the weekly maize advisory by SMS on this number?\n1. Yes\n2. No'
            : 'CON Pokea ushauri wa mahindi kwa SMS kila wiki kwa nambari hii?\n1. Ndiyo\n2. Hapana'
        );
      }

      // Selection 0: Exit
      if (input === '0') {
        await sessionService.deleteSession(sessionId);
        return reply(
          res,
          language === 'en' ? 'END Goodbye. Stay safe.' : 'END Kwaheri. Uwe salama.'
        );
      }

      // Unrecognised selection — re-show the menu.
      return reply(res, mainMenu(language));
    }

    // ---- Pagination: next page of an advisory/alert ----------------------
    const pageMatch = /^(ADVISORY|ALERT)_PAGE:(\d+)$/.exec(session.state);
    if (pageMatch) {
      const kind = pageMatch[1];
      const index = parseInt(pageMatch[2], 10);
      const farmer = await farmerService.findOrCreateFarmer(phoneNumber);
      const language = farmer.language;

      // Rebuild the document (pipeline output is stable within a session).
      let pages;
      if (kind === 'ALERT') {
        const advisory = await advisoryService.getLatestAdvisory(LOCATION, language);
        pages = advisory ? paginate(alertDocument(language, advisory), language) : null;
      } else {
        const [recommendation, advisory] = await Promise.all([
          advisoryService.getLatestRecommendation(LOCATION),
          advisoryService.getLatestAdvisory(LOCATION, language),
        ]);
        pages =
          recommendation && advisory
            ? paginate(advisoryDocument(language, recommendation, advisory), language)
            : null;
      }

      if (!pages || index >= pages.length) {
        await sessionService.updateSessionState(sessionId, 'MAIN_MENU');
        return reply(res, mainMenu(language));
      }
      return reply(res, await renderPage(sessionId, kind, pages, index, language));
    }

    // ---- POST_VIEW: return to menu or end --------------------------------
    if (session.state === 'POST_VIEW') {
      const farmer = await farmerService.findOrCreateFarmer(phoneNumber);
      if (input === '0') {
        await sessionService.updateSessionState(sessionId, 'MAIN_MENU');
        return reply(res, mainMenu(farmer.language));
      }
      await sessionService.deleteSession(sessionId);
      return reply(
        res,
        farmer.language === 'en' ? 'END Goodbye. Stay safe.' : 'END Kwaheri. Uwe salama.'
      );
    }

    // ---- SUBSCRIBE_CONFIRM ------------------------------------------------
    if (session.state === 'SUBSCRIBE_CONFIRM') {
      const farmer = await farmerService.findOrCreateFarmer(phoneNumber);
      const language = farmer.language;

      if (input === '1') {
        await subscriptionService.upsertSubscription(phoneNumber, 'sms', { language });
        await sessionService.updateSessionState(sessionId, 'POST_VIEW');
        const nav = NAV[language] || NAV.sw;
        return reply(
          res,
          language === 'en'
            ? `CON Subscribed! You will receive the maize advisory by SMS every week.\n${nav.menu}`
            : `CON Umejiunga! Utapokea ushauri wa mahindi kwa SMS kila wiki.\n${nav.menu}`
        );
      }
      // Anything else: back to the menu.
      await sessionService.updateSessionState(sessionId, 'MAIN_MENU');
      return reply(res, mainMenu(language));
    }

    // ---- Unknown state: reset -------------------------------------------
    await sessionService.deleteSession(sessionId);
    return reply(res, 'END Session error. Please dial again.');
  } catch (err) {
    console.error('[ussd] Handler error:', err.message);
    return reply(res, 'END A system error occurred. Please try again later.');
  }
});

module.exports = router;
