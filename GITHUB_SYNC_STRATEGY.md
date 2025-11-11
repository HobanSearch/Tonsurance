# GitHub Sync Strategy - Frontend + Backend Integration

## 🎯 Goal
Sync GitHub with your local frontend updates WHILE preserving the working backend/Tonny on the server.

## ⚠️ Critical Rule
**NEVER commit/push backend changes that would overwrite the server's working Tonny/OCaml setup.**

---

## 📋 Step 1: Review What's Changed Locally

```bash
cd /Users/ben/Documents/Work/HS/Application/Tonsurance

# Check what's modified
git status

# Review changes
git diff
```

**Expected Changes** (safe to commit):
- ✅ `frontend/src/pages/TradFiInsurance.tsx` - Hours/days toggle, 10km radius
- ✅ `frontend/src/components/RadiusSelector.tsx` - 10km minimum
- ✅ `frontend/src/App.tsx` - Manifest URL from env
- ✅ `frontend/public/tonconnect-manifest.json` - Production URLs
- ✅ `frontend/.env` - TON API key, contract addresses
- ✅ `frontend/.env.production` - Production config
- ✅ `frontend/.env.local` - Local dev config
- ✅ `contracts/v3/children/NatCatChild.fc` - Hours-based duration
- ✅ `wrappers/v3/NatCatChild.ts` - durationHours parameter
- ✅ `tests/v3/NatCatChild.spec.ts` - Hours-based tests
- ✅ Deployment guides and scripts

**DO NOT Commit** (if modified):
- ❌ `backend/` directory changes
- ❌ `docker-compose.yml`
- ❌ Any backend .env files

---

## 📝 Step 2: Stage ONLY Safe Files

### Option A: Stage Specific Files (Recommended)

```bash
# Stage frontend changes
git add frontend/src/pages/TradFiInsurance.tsx
git add frontend/src/components/RadiusSelector.tsx
git add frontend/src/App.tsx
git add frontend/public/tonconnect-manifest.json
git add frontend/public/tonconnect-manifest.production.json
git add frontend/.env
git add frontend/.env.production
git add frontend/.env.local

# Stage v3 contract updates
git add contracts/v3/children/NatCatChild.fc
git add wrappers/v3/NatCatChild.ts
git add tests/v3/NatCatChild.spec.ts

# Stage deployment infrastructure
git add deploy-frontend-safe.sh
git add verify-deployment-ready.sh
git add test-natcat-compile.ts
git add HACKATHON_DEPLOYMENT_CHECKLIST.md
git add DEPLOYMENT_READY_SUMMARY.md
git add GITHUB_SYNC_STRATEGY.md

# Stage package files if updated
git add package.json
git add package-lock.json
```

### Option B: Use Interactive Staging

```bash
# Review each change interactively
git add -p
# Press 'y' for frontend/contracts changes
# Press 'n' for backend changes
```

---

## 🔍 Step 3: Verify Staging

```bash
# Check what's staged
git status

# Should show ONLY:
# - frontend/ files
# - contracts/v3/ files
# - wrappers/v3/ files
# - tests/v3/ files
# - scripts/v3/ files
# - Documentation .md files

# Should NOT show:
# - backend/ files
# - docker-compose.yml
```

**Critical Check**:
```bash
# Verify backend is NOT staged
git diff --cached --name-only | grep backend
# Should return NOTHING
```

---

## 💾 Step 4: Commit Changes

```bash
git commit -m "feat: Add overnight nat cat bond coverage (6+ hours)

Frontend Updates:
- Add TradFi natural catastrophe insurance page with hours/days toggle
- Support 6-8760 hours duration (6 hours to 365 days minimum)
- Reduce minimum radius to 10km for hyper-local coverage
- Add location picker with geocoding and radius selector
- Configure TonConnect for production (tonsurance.com)

Smart Contract Updates:
- Update NatCatChild.fc to hours-based duration (6-8760 hours)
- Update premium formula: coverage × APR × (hours / 8760)
- Update TypeScript wrapper to send durationHours
- All 14 tests passing with hours-based duration

Deployment Infrastructure:
- Add safe frontend deployment script (preserves backend)
- Add deployment verification script
- Add comprehensive deployment checklists
- Configure production and local environments

Backend/Tonny NOT included - server version preserved

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 🔄 Step 5: Push to GitHub

```bash
# Push to main branch
git push origin main

# Or push to feature branch first (safer)
git checkout -b hackathon-frontend-updates
git push origin hackathon-frontend-updates
```

---

## 🖥️ Step 6: Pull on Server (SAFELY)

### Method A: Selective Pull (Recommended)

SSH to server and pull ONLY frontend changes:

```bash
ssh root@YOUR_SERVER_IP
cd /app/Tonsurance

# Stash any local server changes first
git stash push backend/ docker-compose.yml backend/.env -m "Server backend"

# Pull latest frontend changes
git pull origin main

# Restore server backend
git stash pop

# Verify backend is intact
docker-compose ps api
docker-compose ps tonny-bot
```

### Method B: Cherry-Pick Frontend Commits

```bash
ssh root@YOUR_SERVER_IP
cd /app/Tonsurance

# Fetch latest commits
git fetch origin main

# Cherry-pick only frontend commits (use commit hash from GitHub)
git cherry-pick <commit-hash>
```

---

## 🔧 Step 7: Update Server Configuration

After pulling frontend updates:

```bash
# On server
cd /app/Tonsurance/frontend

# Install dependencies (if package.json changed)
npm install

# Update .env with contract addresses (after you deploy contracts)
nano .env
# Paste contract addresses from testnet deployment

# Build frontend
npm run build

# Restart frontend service
docker-compose restart frontend
# OR
pm2 restart tonsurance-frontend
```

---

## ✅ Step 8: Verify Everything Works

### Check Frontend
```bash
# On server
curl http://localhost:3001
# Should return HTML

curl https://app.tonsurance.com
# Should return HTML
```

### Check Backend (Should Be Unchanged)
```bash
# Check API
curl http://localhost:8080/health
# Should return success

# Check Tonny
docker-compose logs tonny-bot --tail 20
# Should show normal operation (no errors)

# Check database
docker-compose exec postgres psql -U tonsurance -d tonsurance -c "SELECT COUNT(*) FROM policies;"
# Should return count (not error)
```

### Check TonConnect Manifest
```bash
curl https://tonsurance.com/tonconnect-manifest.json
# Should return JSON with "url": "https://tonsurance.com"
```

---

## 🚨 Rollback Plan (If Something Goes Wrong)

### If Backend Breaks

```bash
ssh root@YOUR_SERVER_IP
cd /app/Tonsurance

# Revert to previous commit
git log --oneline -5
git reset --hard <previous-commit-hash>

# Restore backend from stash
git stash list
git stash apply stash@{0}

# Restart services
docker-compose restart api tonny-bot
```

### If Frontend Breaks

```bash
# On server
cd /app/Tonsurance/frontend

# Revert to previous build
git checkout HEAD~1 -- frontend/
npm install
npm run build
docker-compose restart frontend
```

---

## 📊 Pre-Push Checklist

Before running `git push`:

- [ ] Verify `git status` shows ONLY frontend/contracts changes
- [ ] Verify `git diff --cached --name-only | grep backend` returns nothing
- [ ] Verify commit message describes frontend updates only
- [ ] Verify `.env` files don't contain secrets (use .env.example if needed)
- [ ] Verify backend/ is in .gitignore or not staged
- [ ] Have rollback plan ready (know previous commit hash)

---

## 🎯 Post-Push Checklist

After pulling on server:

- [ ] Frontend deploys successfully (`npm run build` works)
- [ ] Backend still running (`curl localhost:8080/health`)
- [ ] Tonny still running (`docker-compose ps tonny-bot`)
- [ ] Database still accessible
- [ ] Frontend accessible at https://app.tonsurance.com
- [ ] TonConnect manifest served correctly

---

## 💡 Best Practices

### Use Feature Branches
```bash
# Create branch for frontend updates
git checkout -b feat/overnight-coverage
git push origin feat/overnight-coverage

# Merge to main after testing
git checkout main
git merge feat/overnight-coverage
git push origin main
```

### Use .gitignore
Add to `.gitignore` if not already there:
```
# Backend environment
backend/.env
backend/.env.local
backend/.env.production

# Local development
frontend/.env.local
.env.local

# Node modules
node_modules/
frontend/node_modules/

# Build artifacts
frontend/dist/
frontend/.next/
```

### Document Backend State
Create `BACKEND_VERSION.md` on server:
```bash
# On server
echo "Backend Version: Working Tonny + OCaml API" > BACKEND_VERSION.md
echo "Last Updated: $(date)" >> BACKEND_VERSION.md
echo "Do NOT overwrite without backup" >> BACKEND_VERSION.md
git add BACKEND_VERSION.md
git commit -m "docs: Document working backend state"
```

---

## 🚀 Next Steps After Sync

1. **Deploy Contracts to Testnet**:
   ```bash
   npx blueprint run scripts/v3/deployHackathonDemo.ts
   ```

2. **Update Frontend .env** with contract addresses

3. **Test on Production**:
   - Open https://app.tonsurance.com/tradfi
   - Connect wallet
   - Test 6-hour hurricane policy
   - Test 12-hour earthquake policy

4. **Monitor Logs**:
   ```bash
   # Frontend logs
   docker-compose logs -f frontend

   # Backend logs (should be unchanged)
   docker-compose logs -f api
   docker-compose logs -f tonny-bot
   ```

---

**Status**: Ready to sync
**Risk Level**: LOW (backend excluded from commit)
**Estimated Time**: 15 minutes
**Rollback Time**: 2 minutes

🚀 **Start with Step 1: Review local changes with `git status`**
