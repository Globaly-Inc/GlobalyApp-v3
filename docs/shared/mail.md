# Shared Mail Service

SMTP email sending via [Nodemailer](https://nodemailer.com/). Falls back to console logging when SMTP is not configured (local dev).

## Location

```
backend/src/shared/mail/
  mailerConfig.ts   — reads SMTP env vars into a typed config
  mailerService.ts  — MailerService class + singleton export
```

## Environment Variables

| Variable        | Required | Default | Description             |
| --------------- | -------- | ------- | ----------------------- |
| `SMTP_HOST`     | No       | —       | SMTP server hostname    |
| `MAIL_PORT`     | No       | `587`   | SMTP port               |
| `MAIL_USERNAME` | No       | —       | SMTP auth user          |
| `MAIL_PASSWORD` | No       | —       | SMTP auth password      |

Config validated in `backend/src/config.ts` (lines 31-34).

Default sender: `noreply@globalyapp.com`

## API

### `mailerService.sendMail(options)`

```ts
import mailerService from "../shared/mail/mailerService.js";

await mailerService.sendMail({
  to: "user@example.com",
  subject: "Welcome",
  html: "<h1>Hello</h1>",
  // or text: "Hello"
});
```

| Field     | Type   | Required | Notes                    |
| --------- | ------ | -------- | ------------------------ |
| `to`      | string | Yes      | Recipient email          |
| `subject` | string | Yes      | Email subject            |
| `html`    | string | No       | HTML body (preferred)    |
| `text`    | string | No       | Plain text fallback      |

If `html` is provided, it takes precedence over `text`.

### `mailerService.verifyConnection()`

Tests the SMTP connection. Returns `true` if verified, `false` otherwise. Logs a warning if no SMTP is configured.

## Local Development

When `SMTP_HOST` is not set, `sendMail` logs the email to console instead of sending. No errors thrown — modules don't need to guard against missing SMTP config.
