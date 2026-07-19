# TGO DevStudio — Backend API

Backend service for TGO DevStudio's public site: handles the contact form (validation, spam protection, storage, and multi-channel notifications) and will expand into the admin API in later phases.

**Live API:** https://tgo-devstudio-backend.onrender.com

## Stack

- Node.js + Express
- MongoDB Atlas (via Mongoose)
- Resend (email notifications)
- CallMeBot (WhatsApp notifications)
- Deployed on Render

## Architecture note

Notification logic lives in `services/notify.js` as a generic, reusable dispatcher — not hardcoded into the contact route. Future features (admin replies, collaborator task alerts, review approvals) should call the same `notify()` function rather than duplicating email/WhatsApp logic.

## Project structure

models/
└── Message.js       # Contact/inquiry schema
routes/
└── contact.js        # POST /api/contact — validation, honeypot, rate limiting
services/
└── notify.js          # Reusable email + WhatsApp dispatcher
index.js                # Express app entry point

## Environment variables

Required in `.env` locally, or as environment variables in Render:

PORT=3000
MONGODB_URI=
RESEND_API_KEY=
NOTIFY_EMAIL=
CALLMEBOT_PHONE=
CALLMEBOT_APIKEY=
ALLOWED_ORIGIN=

## Known limitations (tracked, not bugs)

- **Auto-reply to form senders** is disabled until a custom domain is verified with Resend (their sandbox sender can only email the account owner).
- **WhatsApp notifications** are disabled until a CallMeBot API key is obtained (pending their service response).
- **Render free tier** spins down after 15 minutes of inactivity; first request after idle takes ~30-60s. Acceptable at current traffic levels; revisit if real client traffic increases.

## Commands

| Command | Action |
|---|---|
| `node index.js` | Start the server |

## Related repo

Frontend: https://github.com/testimonygboroye/tgo-devstudio-site
