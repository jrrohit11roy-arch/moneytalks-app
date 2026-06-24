# MoneyTalks Investment App

MoneyTalks is a mobile-first investment and trading app with user registration, RT9 trading, Platium investment, CC Coin wallet requests, live admin-controlled prices, an admin panel, and a built-in assistant.

## Run Locally

Double-click `start-app.bat`, enter an admin password for that local run, then open:

```text
http://localhost:3000
```

You can also run from a terminal:

```text
set ADMIN_PASSWORD=your-secure-password
npm start
```

## Stronger Admin Password Setup

Generate a salted admin password hash:

```text
npm run hash-admin -- your-secure-password
```

Set the printed values as environment variables:

```text
ADMIN_PASSWORD_SALT=...
ADMIN_PASSWORD_HASH=...
```

Do not commit real admin credentials.

## Cloud Deployment

Deploy with Node.js 18 or newer. Set these environment variables in your hosting provider:

```text
PORT=3000
ADMIN_PASSWORD_SALT=...
ADMIN_PASSWORD_HASH=...
```

The app stores data in `data.json` by default. For production, mount persistent disk storage or set `DATA_FILE` to a durable path.

## Verification

```text
npm run check
```
