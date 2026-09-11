# Vercel later (human, after GitHub)

Do not run `vercel` from this agent.

1. Root Directory = `web`
2. Framework = Next.js
3. Env vars from `web/.env.example`
4. Do not put private keys in Vercel
5. After a real on-chain deploy, paste the address into `NEXT_PUBLIC_CONTRACT_ADDRESS` and redeploy
6. CORS proxy is `web/src/app/api/genlayer/route.ts` (serverless POST to Studio RPC — no Docker)
7. `npm run build` inside `web/` must pass before connecting GitHub
8. Empty `NEXT_PUBLIC_CONTRACT_ADDRESS` is legal; the app runs in DEMO · NOT ON-CHAIN mode
