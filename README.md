<p align="center">
  <img src="https://img.shields.io/badge/VALORANT-FA4454?style=for-the-badge&logo=valorant&logoColor=white" alt="Valorant" />
  <img src="https://img.shields.io/badge/Django-092E20?style=for-the-badge&logo=django&logoColor=white" alt="Django" />
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Tauri-FFC131?style=for-the-badge&logo=tauri&logoColor=24C8DB" alt="Tauri" />
</p>

# VAL_TRACK — Valorant LFG Platform

A full-stack **Looking For Group** platform for Valorant players. Find teammates, verify ranks through the Riot API, create matchmaking queues, and connect in real-time — available as a web app and a native desktop client.

---

## Architecture

```
VAL_TRACK/
├── valo-lfg-backend/     # Django REST API + WebSocket server
├── valo-lfg-frontend/    # React SPA (Vite + TailwindCSS)
└── valo-lfg-desktop/     # Tauri v2 native desktop app
```

| Layer | Stack |
|---|---|
| **Backend** | Django 5.2 · DRF · Channels (ASGI) · Celery · PostgreSQL · Redis |
| **Frontend** | React 19 · Vite · TailwindCSS 4 · Tanstack Query · React Three Fiber · Motion |
| **Desktop** | Tauri v2 · React · Vite |
| **Auth** | Google & Discord OAuth → JWT (httpOnly refresh cookie) |
| **Realtime** | Django Channels → Redis Pub/Sub WebSocket layer |
| **Task queue** | Celery + Celery Beat (rank refresh every 3 hrs) |
| **API docs** | drf-spectacular → Swagger UI at `/api/docs/` |

---

## Features

- **OAuth login** — Sign in with Google or Discord
- **Player profiles** — Role tags (duelist, sentinel, etc.), weekly schedule, avatar
- **Riot account linking** — Link your Riot ID, verify ownership by playing a match, auto-fetch rank & division
- **Matchmaking queue** — Create or browse party listings, join requests with host accept/decline
- **Realtime updates** — WebSocket-powered live queue feed & join-request notifications
- **Periodic rank sync** — Celery Beat refreshes all linked ranks every 3 hours
- **Desktop client** — Native Windows/macOS/Linux app via Tauri

---

## Prerequisites

| Tool | Version |
|---|---|
| [Docker](https://docs.docker.com/get-docker/) & Docker Compose | latest |
| [Node.js](https://nodejs.org/) | ≥ 20 |
| [Rust](https://www.rust-lang.org/tools/install) | ≥ 1.77 *(desktop only)* |

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/adityagoyal200/VAL_TRACK.git
cd VAL_TRACK
```

### 2. Backend setup

The backend runs entirely in Docker (Django, PostgreSQL, Redis, Celery worker & beat).

```bash
cd valo-lfg-backend
```

**Create your `.env` file:**

```bash
cp .env.example .env
# or create .env manually with the variables below
```

**Required environment variables** (`valo-lfg-backend/.env`):

```env
# Django
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# Database (matches docker-compose defaults)
DATABASE_URL=postgres://valo:valo@postgres:5432/valo_lfg

# Redis (matches docker-compose defaults)
REDIS_URL=redis://redis:6379/0

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# OAuth (get these from the respective developer consoles)
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
DISCORD_OAUTH_CLIENT_ID=
DISCORD_OAUTH_CLIENT_SECRET=

# Riot data — HenrikDev API key (https://docs.henrikdev.xyz/)
HENRIKDEV_API_KEY=
```

**Start the services:**

```bash
docker compose up --build -d
```

This starts:
- **PostgreSQL** on `localhost:5432`
- **Redis** on `localhost:6379`
- **Django dev server** on `localhost:8000`
- **Celery worker** (background tasks)
- **Celery beat** (scheduled rank refresh)

**Run migrations:**

```bash
docker compose exec backend python manage.py migrate
```

**Create a superuser** *(optional)*:

```bash
docker compose exec backend python manage.py createsuperuser
```

> **API docs**: Once running, visit [http://localhost:8000/api/docs/](http://localhost:8000/api/docs/) for the interactive Swagger UI.

---

### 3. Frontend setup

```bash
cd valo-lfg-frontend
npm install
npm run dev
```

The React dev server starts at [http://localhost:5173](http://localhost:5173).

> The frontend expects the backend at `http://localhost:8000`. This is the default CORS origin configured in the backend.

---

### 4. Desktop app *(optional)*

Requires [Rust](https://www.rust-lang.org/tools/install) to be installed.

```bash
cd valo-lfg-desktop
npm install
npm run tauri dev
```

This compiles the Tauri shell and opens the native desktop window pointing at the Vite dev server.

---

## Project Structure

<details>
<summary><b>valo-lfg-backend/</b></summary>

```
valo-lfg-backend/
├── apps/
│   ├── accounts/       # Custom User model, Google/Discord OAuth, JWT auth
│   ├── profiles/       # Player profiles, role tags, weekly schedule
│   ├── integrations/   # Riot account linking, rank fetch, match verification
│   ├── matchmaking/    # Party queue CRUD, join requests, accept/decline
│   ├── realtime/       # Django Channels consumers, JWT WS middleware
│   └── common/         # Shared utilities, base models
├── config/
│   ├── settings/
│   │   ├── base.py     # Shared settings
│   │   ├── local.py    # Dev overrides
│   │   └── production.py
│   ├── asgi.py         # ASGI entrypoint (HTTP + WebSocket routing)
│   ├── celery.py       # Celery app
│   └── urls.py         # Root URL config
├── requirements/
│   ├── base.txt
│   ├── local.txt
│   └── production.txt
├── docker-compose.yml
├── Dockerfile
└── manage.py
```

</details>

<details>
<summary><b>valo-lfg-frontend/</b></summary>

```
valo-lfg-frontend/
├── src/
│   ├── api/            # API client & query hooks
│   ├── app/            # App shell, routing, providers
│   ├── components/     # Shared UI components (shadcn/ui)
│   ├── features/
│   │   ├── auth/       # Login flow
│   │   ├── onboarding/ # Wizard (basics, roles, schedule)
│   │   ├── profile/    # Profile settings & account linking
│   │   ├── queue/      # Live matchmaking queue UI
│   │   └── riot/       # Riot account linking flow
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utility helpers
│   ├── schemas/        # Zod validation schemas
│   ├── index.css       # Design system & global styles
│   └── main.tsx        # App entry point
├── package.json
├── vite.config.ts
└── tsconfig.json
```

</details>

<details>
<summary><b>valo-lfg-desktop/</b></summary>

```
valo-lfg-desktop/
├── src/                # React frontend (Tauri webview)
├── src-tauri/
│   ├── capabilities/   # Tauri security permissions
│   ├── icons/          # App icons
│   ├── tauri.conf.json # Tauri configuration
│   ├── Cargo.toml      # Rust dependencies
│   └── src/            # Rust backend code
├── package.json
├── vite.config.ts
└── tsconfig.json
```

</details>

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/google/` | Google OAuth login |
| `POST` | `/api/auth/discord/` | Discord OAuth login |
| `POST` | `/api/auth/refresh/` | Refresh access token (cookie) |
| `POST` | `/api/auth/logout/` | Logout & blacklist refresh token |
| `GET/PATCH` | `/api/profile/me/` | Current user profile |
| `POST` | `/api/riot/link/` | Link Riot account |
| `POST` | `/api/riot/verify/` | Verify Riot account via match |
| `GET` | `/api/queue/browse/` | Browse matchmaking queue |
| `GET` | `/api/queue/mine/` | Your queue listings |
| `POST` | `/api/queue/` | Create a queue listing |
| `POST` | `/api/queue/{id}/join/` | Request to join a party |
| `POST` | `/api/queue/{id}/accept/` | Accept a join request |
| `POST` | `/api/queue/{id}/decline/` | Decline a join request |
| `WS` | `ws://host/ws/queue/` | Realtime queue & request events |
| `GET` | `/api/docs/` | Swagger UI |
| `GET` | `/api/schema/` | OpenAPI schema |

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `SECRET_KEY` | ✅ | — | Django secret key |
| `DEBUG` | | `False` | Enable debug mode |
| `ALLOWED_HOSTS` | | `[]` | Comma-separated allowed hosts |
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `REDIS_URL` | | `redis://localhost:6379/0` | Redis connection string |
| `CORS_ALLOWED_ORIGINS` | | `[]` | Comma-separated allowed origins |
| `GOOGLE_OAUTH_CLIENT_ID` | | `""` | Google OAuth client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | | `""` | Google OAuth client secret |
| `DISCORD_OAUTH_CLIENT_ID` | | `""` | Discord OAuth client ID |
| `DISCORD_OAUTH_CLIENT_SECRET` | | `""` | Discord OAuth client secret |
| `HENRIKDEV_API_KEY` | | `""` | HenrikDev API key for rank data |

---

## License

This project is for educational and personal use.
