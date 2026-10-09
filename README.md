# JIRA Agent - Cloud backend

Express + Prisma + PostgreSQL service that receives JIRA webhooks, holds
accounts/devices, mirrors tasks, and routes notifications. It never runs
OpenCode - agent execution stays on the desktop.

See `../docs/phase-19-cloud-backend.md` for the full phase record.

## Setup

```powershell
# 1. PostgreSQL (18) - development container
docker run -d --name jira-agent-pg `
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres `
  -p 5432:5432 -v jira-agent-pgdata:/var/lib/postgresql postgres:18
docker exec jira-agent-pg psql -U postgres -c "CREATE DATABASE jira_agent;"
docker exec jira-agent-pg psql -U postgres -c "CREATE DATABASE jira_agent_test;"

# 2. Dependencies and schema
npm install
Copy-Item .env.example .env    # adjust if needed
npx prisma migrate dev

# 3. Run
npm run dev                    # tsx watch on http://localhost:4000
npm run build && npm start     # compiled
npm test                       # vitest + supertest (deploys migrations first)
```

## Endpoints

`GET /health` · `POST /auth/register|login` · `GET /auth/me` ·
`POST|GET /devices` · `POST|GET /jira/connections` ·
`POST /webhooks/jira/:secret` · `GET /notifications` ·
`POST /notifications/:id/read` · `GET /tasks` · `POST /tasks/sync` ·
`WS /ws` (device-token header; pushes `ticket.*`, `task.updated`,
`plan.ready`, `pr.created`).

See the phase document for request/response shapes.
