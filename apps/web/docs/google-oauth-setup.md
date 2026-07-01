# Google OAuth setup — StreamKill web ingress

Turnkey steps to unlock the live test: real sign-in → Gmail connect →
same-email pass / different-email block. ~30 minutes. You need **two** Google
accounts to prove the block (a "verified" one and a "wrong" one).

## 1. Project + Gmail API
1. https://console.cloud.google.com → create a project **StreamKill** (or select one).
2. **APIs & Services → Library → enable "Gmail API".**

## 2. OAuth consent screen
1. **APIs & Services → OAuth consent screen.**
2. User type: **External** → Create.
3. App name **StreamKill**, your support email, developer contact email.
4. **Scopes → Add:**
   - `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
   - `.../auth/gmail.readonly`  ← restricted scope (read-only)
5. **Test users → Add:** your primary Google account **and** a second Google
   account (the "wrong inbox" for the mismatch test). Add KJ's too if he'll try it.
6. Leave publishing status on **Testing** (fine up to 100 users).
   > Public launch later needs Google's **CASA** security review for the
   > restricted `gmail.readonly` scope. Not needed for the test.

## 3. OAuth client credentials
1. **APIs & Services → Credentials → Create credentials → OAuth client ID.**
2. Application type: **Web application**, name **StreamKill Web**.
3. **Authorized JavaScript origins:**
   - `http://localhost:3000`
   - `https://streamkill.ai`
4. **Authorized redirect URIs — add all four** (two flows × two hosts):
   - `http://localhost:3000/api/auth/callback/google`
   - `http://localhost:3000/api/gmail/callback`
   - `https://streamkill.ai/api/auth/callback/google`
   - `https://streamkill.ai/api/gmail/callback`
5. Create → copy the **Client ID** and **Client secret**.

## 4. Wire it locally
In `apps/web/.env.local` (create from `.env.example` if needed):

```
AUTH_SECRET=<already generated>
CONTRACT_SIGNING_SECRET=<openssl rand -base64 32>   # share this exact value with Ainz's engine
AUTH_GOOGLE_ID=<Client ID>
AUTH_GOOGLE_SECRET=<Client secret>
# ENGINE_URL unset for now → app uses the local sample ledger.
```

## 5. Run the live test
```
cd apps/web && npm run dev   # http://localhost:3000
```
1. **Sign in with Google** as your primary account → lands on `/scan`, shows your verified email.
2. **Connect Gmail** → choose the **same** account → ledger appears (🔒 banner shows your email). ✅ same-email pass.
3. Sign out, sign in again, **Connect Gmail** → choose the **second** account → you hit the **blocked** page with the safety message. ✅ different-email block.

That's the whole trust rail proven on live Google accounts.
