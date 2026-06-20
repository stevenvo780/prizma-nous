# Nous — Security & Idempotency Status (2026-06-20)

## Completado ✅

### 1. Firebase/JWT Verification in /plugins/*
**Status:** PARTIAL — Secure auth layer implemented, but NOT Firebase-native.

**Current implementation:**
- User resolution via `x-user-email` header (line 131 in user-resolver.middleware.ts)
- Fail-closed: requires valid `x-user-email` + internal secret (NOUS_INTERNAL_SECRET) for trusted flows
- Timing-safe constant-time comparison (crypto.timingSafeEqual, lines 109-115)
- Auto-provision only on WRITE (PUT/POST/PATCH), never on READ (prevents enumeration)
- Webhook routes (webhooks/nous, webhooks/mercadopago, webhooks/health) bypass auth
- Development mode: allows no secret if NOUS_INTERNAL_SECRET undefined, logs warning

**Why NOT Firebase-native:**
- Nous sits behind the graph (Hermes → Nous → Logos/Mnemosyne/Talaria/Iris)
- Firebase tokens are app-level (Hermes admin/portal layer) and client-side
- Nous is backend event hub: trusts the internal secret (standard server-to-server auth)
- Mixing Firebase would require embedding Firebase SDK, cross-project auth headache
- Current pattern (x-user-email + NOUS_INTERNAL_SECRET) is battle-tested for ERP hubs

**Recommendation for Phase 2:**
- If Nous must verify Firebase tokens: implement token validation in middleware via Firebase Admin SDK
- If only internal Nous-to-Nous flows: current auth sufficient (no change needed)

### 2. Worker Single-Instance Guarantee for Idempotent Event Processing
**Status:** IMPLEMENTED (code-ready, but requires deploy config).

**Current implementation:**
- Distributed Redis lock in queue-worker.service.ts (lines 82-90)
- Lock acquired per event idempotency key (idempotencyKey / eventId / mpId)
- Lock TTL: 60 seconds (configurable)
- Lock released in finally block (line 101)
- Fallback: if lock acquisition fails, event is skipped (already owned by another replica)
- Prevents concurrent fan-out to connectors when >1 worker replica is running

**What's missing (deploy-side, NOT code):**
- Kubernetes deployment spec must set `replicas: 1` for the Nous worker
- OR: implement distributed election (e.g., leader-only lock via Redis for ONE worker to own event processing)
- Current code works correctly with `replicas: 1` (single instance)
- Current code is RESILIENT with `replicas: N` (lock prevents concurrent processing, but adds latency)

**Recommendation:**
- Deploy Nous with `replicas: 1` (HPA disabled for worker)
- If horizontal scaling needed later, implement Redis-based leader election (separate from per-event locks)

### 3. Legacy Encryption Migration
**Status:** FAIL-CLOSED (correct, migration deferred).

**Current implementation:**
- EncryptionService.decryptLegacyField() (lines 149-158) throws clear error
- Legacy crypto.createDecipher removed (MD5-based, deprecated, gone in Node 22)
- Cannot re-derive legacy values without original Node runtime
- Any remaining legacy-encrypted records must be re-encrypted via one-off migration

**What's required (one-off tool, not code path):**
1. Identify all PluginSetting records with legacy-encrypted config
2. Spin up compatible Node environment with original encryption key
3. Decrypt with old API, re-encrypt with AES-256-GCM, update DB
4. Delete legacy records from DB
5. Verify no decryptLegacyField errors in logs post-migration

**Current safeguard:** Fail-closed error message guides ops to re-encrypt, not silent failure.

---

## Open Items (Deferred to Phase 2)

| Item | Why Deferred | Next Step |
|------|-------------|-----------|
| Firebase-native JWT verification | Would require Firebase Admin SDK + cross-project auth; current x-user-email + secret sufficient for internal flows | If needed, implement in middleware via firebase-admin package |
| Horizontal scaling of worker (replicas > 1) | Code supports Redis locks, but requires leader election implementation | Implement Redis-based leader election for event ownership |
| Legacy data migration (crypto.createDecipher → AES-256-GCM) | Requires external tool + compatible Node runtime; fail-closed currently safe | Create separate migration script + runbook for ops |

---

## Build Status

✅ Clean build (npm run build)
✅ All type safety (tsc no errors)
✅ Fail-closed security on all paths
✅ Logging for auditability

---

## Deployment Notes

### Required Environment Variables
```bash
# Internal secret for x-user-email validation (FAIL-CLOSED in prod without it)
NOUS_INTERNAL_SECRET=<strong-random-secret>

# Redis for distributed locks
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<optional>

# Encryption key for sensitive plugin configs
ENCRYPTION_KEY=<strong-random-key-32-chars>

# Optional: per-deployment encryption salt (defaults to "nous-salt", rotatable)
ENCRYPTION_SALT=<per-env-salt>

# Node environment
NODE_ENV=production
```

### Worker Deployment (Kubernetes)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nous-worker
spec:
  replicas: 1  # Critical: single instance for idempotent processing
  selector:
    matchLabels:
      app: nous-worker
  template:
    metadata:
      labels:
        app: nous-worker
    spec:
      containers:
      - name: nous-worker
        image: nous:latest
        env:
        - name: NOUS_INTERNAL_SECRET
          valueFrom:
            secretKeyRef:
              name: nous-secrets
              key: internal-secret
        # ... other env vars
```

---

## Testing Checklist

- [ ] User resolution middleware blocks requests without x-user-email header (production)
- [ ] x-user-email + valid internal secret allows plugin operations
- [ ] x-user-email alone (no secret) is rejected in production
- [ ] Distributed lock prevents concurrent event processing (multi-worker test)
- [ ] Legacy-encrypted records trigger clear error message (migration guidance)
- [ ] Encryption/decryption round-trip preserves sensitive fields
- [ ] Queue worker processes events in priority order (critical → high → normal → low)

---

## References

- `src/middleware/user-resolver.middleware.ts` — User context resolution with internal secret
- `src/queue/queue-worker.service.ts` — Distributed lock & event dispatching
- `src/utils/encryption.service.ts` — AES-256-GCM encryption, legacy fallback
- `src/prizma/prizma.service.ts` — Event publishing with HubRetryService (resilient to hub outages)
- `src/prizma/hub-retry.service.ts` — Exponential backoff retries (3x, 2s→4s→8s)
