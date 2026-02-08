# Guide de Développement et Déploiement
> Document v1.0 — 2026-02-08

Ce document décrit l'architecture, les processus de déploiement, les audits et les procédures de sécurité pour la plateforme **hotel.com.tn**.

---

## Table of Contents

1. [Contexte & Domaines](#1-contexte--domaines)
2. [Source de Vérité : "Ce qui est déployé"](#2-source-de-vérité--ce-qui-est-déployé)
3. [Exigence : "/version partout"](#3-exigence--version-partout)
4. [myGO Credit Dashboard (Admin)](#4-mygo-credit-dashboard-admin)
5. [Checkout Policy](#5-checkout-policy)
6. [ClicToPay Integration](#6-clictopay-integration)
7. [Cloudflare Worker API Reference](#7-cloudflare-worker-api-reference)
8. [Security & Best Practices](#8-security--best-practices)
9. [Pre-Deployment Checklist](#9-pre-deployment-checklist)
10. [Contacts & Ressources](#10-contacts--ressources)

---

## 1. Contexte & Domaines

La plateforme hotel.com.tn est composée de plusieurs services déployés sur différentes infrastructures :

| Domaine | Infrastructure | Description |
|---------|---------------|-------------|
| **www.hotel.com.tn** | GitHub Pages | Site public (frontend React/Vite) |
| **admin.hotel.com.tn** | GitHub Pages | Interface d'administration |
| **api.hotel.com.tn** | Supabase Edge Functions (actuel)<br>Cloudflare Worker (futur) | API backend pour les requêtes frontend |
| **Supabase** | Supabase Cloud | Postgres + Auth + Edge Functions |
| **Cloudflare** | Cloudflare | DNS routing et gestion de domaine |

### État actuel vs. futur

- **Actuellement** : Le backend utilise **Supabase Edge Functions** (Deno + TypeScript)
- **Futur** : Migration prévue vers **Cloudflare Worker** pour `api.hotel.com.tn`
- Les deux infrastructures coexisteront pendant la transition

---

## 2. Source de Vérité : "Ce qui est déployé"

Pour auditer rapidement l'état du déploiement production, voici comment retrouver les versions déployées.

### 2.1 GitHub Pages (www / admin)

**Comment trouver le commit déployé :**
1. Aller sur l'onglet **Actions** du repository concerné (`www.hotel.com.tn` ou `admin.hotel.com.tn`)
2. Filtrer par workflow : `pages-build-deployment` ou `Deploy to GitHub Pages`
3. Identifier le dernier workflow **réussi** (✅) sur la branche `main`
4. Ouvrir le workflow run → voir le commit SHA dans les détails

**Alternative (pages publiques) :**
- Vérifier le fichier `version.json` déployé :
  - `https://www.hotel.com.tn/version.json`
  - `https://admin.hotel.com.tn/version.json`
- Format attendu : `{ "sha": "abc123", "builtAt": "2026-02-08T12:00:00Z", "env": "production" }`

### 2.2 Supabase Edge Functions (actuel)

**Comment trouver le commit déployé :**
1. Aller sur l'onglet **Actions** de `api.hotel.com.tn`
2. Ouvrir le workflow **Deploy Supabase Edge Functions**
3. Identifier le dernier workflow réussi sur `main`
4. Voir le commit SHA dans les détails du run

**Endpoint de version :**
- Appeler `GET https://<project-ref>.supabase.co/functions/v1/version`
- Retourne : `{ "sha": "abc123", "builtAt": "2026-02-08T12:00:00Z", "env": "production" }`

### 2.3 Cloudflare Worker (futur)

**Tableau de bord Cloudflare :**
1. Se connecter à Cloudflare Dashboard
2. Aller dans **Workers & Pages** → sélectionner `api-hotel-com-tn`
3. Onglet **Deployments** : voir l'historique des déploiements avec dates et commit SHA

**Endpoint de version :**
- Appeler `GET https://api.hotel.com.tn/version`
- Retourne : `{ "sha": "abc123", "builtAt": "2026-02-08T12:00:00Z", "env": "production" }`

---

## 3. Exigence : "/version partout"

Tous les services doivent exposer un endpoint ou fichier `/version` pour faciliter les audits.

### 3.1 Contrat JSON

Format standard pour tous les environnements :

```json
{
  "sha": "abc123def456",
  "builtAt": "2026-02-08T12:00:00Z",
  "env": "production"
}
```

**Champs :**
- `sha` : Commit SHA du code déployé (40 caractères Git SHA-1)
- `builtAt` : Timestamp ISO 8601 de la construction du build
- `env` : Environnement (`production`, `staging`, `development`)

### 3.2 Implémentation par service

#### Cloudflare Worker
- **Route** : `GET /version`
- **Variables d'environnement** :
  - `GITHUB_SHA` : injecté par GitHub Actions au build
  - `BUILT_AT` : injecté par GitHub Actions au build
  - `ENVIRONMENT` : défini dans `wrangler.toml` ou secrets

#### Supabase Edge Functions
- **Route** : `GET /functions/v1/version`
- **Variables d'environnement** (Supabase secrets) :
  - `GITHUB_SHA` : défini via `supabase secrets set`
  - `BUILT_AT` : défini via `supabase secrets set`
  - `ENVIRONMENT` : défini via `supabase secrets set`

#### GitHub Pages (www / admin)
- **Fichier statique** : `/version.json` généré au build
- **Build-time injection** :
  ```bash
  # Dans le workflow GitHub Actions
  echo '{"sha":"$GITHUB_SHA","builtAt":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","env":"production"}' > dist/version.json
  ```

---

## 4. myGO Credit Dashboard (Admin)

L'interface admin doit afficher le solde du compte myGO en temps réel.

### 4.1 Source de données

**API myGO** : `CreditCheck`
- **Endpoint** : `https://admin.mygo.co/api/hotel/CreditCheck`
- **Authentification** : Credentials dans le XML body
- **Réponse** :
  ```xml
  <CreditCheck>
    <RemainingDeposit>15000.50</RemainingDeposit>
    <Currency>TND</Currency>
  </CreditCheck>
  ```

### 4.2 Implémentation backend

**Edge Function** : `/functions/v1/mygo-credit` (à créer)
- **Méthode** : `GET`
- **Auth** : Requiert JWT admin (via middleware `requireAdmin`)
- **Réponse** :
  ```json
  {
    "remainingDeposit": 15000.50,
    "currency": "TND",
    "fetchedAt": "2026-02-08T14:30:00Z"
  }
  ```

### 4.3 Interface admin

**Affichage :**
- Badge en haut à droite : "Solde myGO: 15 000,50 TND"
- Couleur :
  - Vert si > 5000 TND
  - Orange si 1000-5000 TND
  - Rouge si < 1000 TND

**Snapshot historique (futur) :**
- Endpoint `GET /mygo-credit-history` (enregistre snapshot quotidien)
- Graphique d'évolution sur 30 jours

**SSE Stream (futur) :**
- WebSocket ou Server-Sent Events pour mise à jour temps réel du solde
- Notification push si solde < seuil critique

---

## 5. Checkout Policy

La plateforme supporte deux modes de réservation :

### 5.1 Modes disponibles

| Mode | Description | Impact sur BookingCreation |
|------|-------------|----------------------------|
| **STRICT** | Réservation immédiate obligatoire | `PreBooking=false` |
| **ON_HOLD_PREAUTH** | Pré-réservation avec confirmation ultérieure | `PreBooking=true` |

**Mode par défaut** : `ON_HOLD_PREAUTH` (recommandé pour éviter les surréservations)

### 5.2 Configuration admin

L'admin peut modifier ce paramètre via l'interface.

**Backend endpoints :**

1. **GET /functions/v1/settings/checkout-policy**
   - Auth : Requiert JWT (lecture publique ou admin seulement ?)
   - Réponse :
     ```json
     {
       "policy": "ON_HOLD_PREAUTH",
       "updatedAt": "2026-02-01T10:00:00Z",
       "updatedBy": "admin@hotel.com.tn"
     }
     ```

2. **PUT /functions/v1/settings/checkout-policy**
   - Auth : Requiert JWT admin
   - Body :
     ```json
     {
       "policy": "STRICT"
     }
     ```
   - Réponse : même structure que GET + confirmation

### 5.3 Audit log

**Tous les changements de settings doivent être loggés** dans une table `settings_audit_log` :

```sql
CREATE TABLE settings_audit_log (
  id BIGSERIAL PRIMARY KEY,
  setting_key TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 6. Supabase : Normalisation et Migrations

### 6.1 État actuel

- **Dashboard changes** : Les modifications de schéma se font parfois manuellement via le dashboard Supabase
- **Problème** : Pas de traçabilité, risque de divergence entre dev/prod

### 6.2 Stratégie de normalisation

**Règle absolue :**
> Toute modification de schéma doit être capturée dans un fichier de migration versionné sous `supabase/migrations/`.

**Processus :**
1. **Développement local** :
   - Utiliser `supabase db diff` pour générer une migration depuis les changements locaux
   - Ou créer manuellement un fichier de migration SQL

2. **Synchronisation depuis prod** :
   - Si des changements ont été faits manuellement en prod (à éviter !) :
     - Utiliser le workflow GitHub Actions `audit-supabase-schema.yml` pour dumper le schéma prod
     - Comparer avec le schéma local
     - Créer une migration pour aligner le repo avec la prod

3. **Application des migrations** :
   - En local : `supabase db push`
   - En prod : via migrations automatiques lors du déploiement ou via Supabase CLI

### 6.3 Workflow GitHub Actions : Dump Schema

**Workflow** : `.github/workflows/audit-supabase-schema.yml`

**Déclenchement** : Manuel uniquement (`workflow_dispatch`)

**Étapes :**
1. Installer `postgresql-client` sur le runner Ubuntu
2. Se connecter à Supabase prod via `SUPABASE_DB_URL_PROD` (secret)
3. Exécuter `pg_dump --schema-only --no-owner --no-privileges`
4. Uploader le fichier comme artifact : `supabase-schema-<date>.sql`

**Usage :**
- Déclencher manuellement depuis l'onglet Actions
- Télécharger l'artifact pour auditer les différences avec le repo

---

## 7. Sécurité

### 7.1 Secrets et Credentials

**Secrets à protéger absolument :**

| Secret | Usage | Stockage |
|--------|-------|----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Admin API calls | GitHub Secrets + Supabase Secrets |
| `MYGO_LOGIN` | Authentification myGO | Supabase Secrets (Edge Functions) |
| `MYGO_PASSWORD` | Authentification myGO | Supabase Secrets (Edge Functions) |
| `CLICTOPAY_MERCHANT_ID` | Intégration paiement | Supabase Secrets |
| `CLICTOPAY_SECRET_KEY` | Signature HMAC | Supabase Secrets |
| `SUPABASE_DB_URL_PROD` | Connexion Postgres prod | GitHub Secrets (audit workflow) |
| `CLOUDFLARE_API_TOKEN` | Déploiement Worker | GitHub Secrets |

### 7.2 Règles de sécurité

**NEVER :**
- ❌ Committer des secrets dans le code ou `.env` (utiliser `.env.example` sans valeurs réelles)
- ❌ Logger des tokens myGO ou des mots de passe en clair
- ❌ Exposer des credentials dans les réponses API (même en erreur)
- ❌ Stocker des tokens en clair dans la base de données (hashing SHA-256 obligatoire)

**ALWAYS :**
- ✅ Utiliser GitHub Secrets pour les workflows CI/CD
- ✅ Utiliser Supabase Secrets pour les Edge Functions (`supabase secrets set`)
- ✅ Logger tous les changements de settings admin dans `settings_audit_log`
- ✅ Valider et sanitizer tous les inputs utilisateur (XSS, SQL injection)
- ✅ Appliquer CORS allowlist strict sur les endpoints publics
- ✅ Rate limiting sur les endpoints publics (voir README.md)

### 7.3 Fonctionnalités de sécurité existantes

Voir [README.md](../README.md) section **Security Features** pour la liste complète :
- Hashing des tokens myGO (SHA-256)
- Rate limiting avec stockage des IP hashées (privacy-preserving)
- CORS allowlist (`https://www.hotel.com.tn`, `http://localhost:5173`)
- JWT authentication pour endpoints privés
- Middleware unifié avec checks admin
- Validation et sanitization des inputs
- Prévention XML injection (proper escaping)
- Timeout 30s sur les appels myGO API
- Pas de retry sur opérations non-idempotentes (BookingCreation)
- Token isolation (PR13) : les tokens ne quittent jamais le backend

---

## 8. Checklist Audit (30 minutes)

Utilisez cette checklist pour auditer rapidement l'état de la plateforme en production.

### 8.1 www.hotel.com.tn (Frontend Public)

- [ ] Site accessible : `https://www.hotel.com.tn`
- [ ] Vérifier `/version.json` → SHA correspond au dernier commit main ?
- [ ] Tester recherche hôtel → résultats s'affichent ?
- [ ] Tester changement de dates → requête API fonctionne ?
- [ ] Vérifier console browser → pas d'erreurs CORS ?

### 8.2 admin.hotel.com.tn (Interface Admin)

- [ ] Admin accessible : `https://admin.hotel.com.tn`
- [ ] Vérifier `/version.json` → SHA correspond au dernier commit main ?
- [ ] Connexion admin → authentification Supabase Auth fonctionne ?
- [ ] Dashboard myGO credit affiché ?
- [ ] Paramètres checkout policy accessibles et modifiables ?

### 8.3 api.hotel.com.tn (Backend)

**Supabase Edge Functions (actuel) :**
- [ ] `GET /functions/v1/version` → retourne SHA + builtAt ?
- [ ] `POST /functions/v1/search-hotels` → recherche fonctionne ?
- [ ] `POST /functions/v1/create-booking` → création booking (prebooking=true) fonctionne ?
- [ ] Vérifier GitHub Actions → dernier deploy réussi ?
- [ ] Vérifier logs Supabase → pas d'erreurs critiques récentes ?

**Cloudflare Worker (futur) :**
- [ ] `GET https://api.hotel.com.tn/version` → retourne SHA + builtAt ?
- [ ] Cloudflare Dashboard → déploiement récent visible ?

### 8.4 Supabase (Database + Auth)

- [ ] Dashboard Supabase accessible ?
- [ ] Vérifier tables principales : `bookings`, `mygo_bookings`, `inventory_hotels`
- [ ] Vérifier Auth users → nombre d'utilisateurs attendu ?
- [ ] Tester une requête SQL manuelle → base responsive ?
- [ ] Vérifier storage used → pas proche de la limite ?

### 8.5 Cloudflare (DNS + Routing)

- [ ] DNS records :
  - [ ] `www.hotel.com.tn` → pointe vers GitHub Pages ?
  - [ ] `admin.hotel.com.tn` → pointe vers GitHub Pages ?
  - [ ] `api.hotel.com.tn` → pointe vers Cloudflare Worker (futur) ou Supabase ?
- [ ] SSL certificates actifs et valides (pas d'expiration proche) ?
- [ ] Cloudflare Analytics → trafic attendu ?

### 8.6 myGO API (Supplier Integration)

- [ ] Solde myGO > seuil critique ?
- [ ] Endpoint `mygo-credit` fonctionne ?
- [ ] Dernière synchro cities/hotels réussie ? (voir logs)
- [ ] Tester manuellement un appel myGO HotelSearch → réponse OK ?

---

## 9. Checklist Go Live

Avant de mettre en production une nouvelle version majeure, suivez cette checklist exhaustive.

### 9.1 Code & Tests

- [ ] Tous les tests unitaires passent (Deno tests dans `_shared/`)
- [ ] Code review approuvé par au moins un reviewer
- [ ] Pas de `console.log` sensibles (credentials, tokens) dans le code
- [ ] `.gitignore` à jour (pas de `.env` ou secrets committés)
- [ ] README.md et docs à jour avec les nouveaux endpoints

### 9.2 Migrations & Schema

- [ ] Toutes les migrations SQL dans `supabase/migrations/` appliquées en local
- [ ] Dump schema prod (`audit-supabase-schema.yml`) et comparaison avec local
- [ ] Pas de divergence entre schéma prod et repo (ou migration de rattrapage créée)
- [ ] Backup de la base prod effectué (snapshot Supabase ou export manuel)

### 9.3 Secrets & Configuration

- [ ] Tous les secrets définis dans GitHub Secrets :
  - [ ] `SUPABASE_ACCESS_TOKEN`
  - [ ] `SUPABASE_PROJECT_ID`
  - [ ] `CLOUDFLARE_API_TOKEN` (si Worker)
  - [ ] `CLOUDFLARE_ACCOUNT_ID` (si Worker)
  - [ ] `SUPABASE_DB_URL_PROD`
- [ ] Tous les secrets définis dans Supabase Secrets :
  - [ ] `MYGO_LOGIN`
  - [ ] `MYGO_PASSWORD`
  - [ ] `CLICTOPAY_MERCHANT_ID`
  - [ ] `CLICTOPAY_SECRET_KEY`
  - [ ] `GITHUB_SHA` (sera défini par workflow)
  - [ ] `BUILT_AT` (sera défini par workflow)
  - [ ] `ENVIRONMENT=production`
- [ ] Variables d'environnement frontend (www/admin) correctes (URLs API)

### 9.4 Déploiement

- [ ] Déploiement www/admin : GitHub Actions réussi → vérifier `/version.json`
- [ ] Déploiement Edge Functions : `deploy-edge-functions.yml` réussi → vérifier `/version` endpoint
- [ ] Déploiement Worker (futur) : `deploy-worker.yml` réussi → vérifier `/version` endpoint
- [ ] Rollback plan documenté (comment revenir à la version précédente ?)

### 9.5 Tests Post-Déploiement

- [ ] **Smoke tests** :
  - [ ] Recherche hôtel fonctionne (frontend → API → myGO)
  - [ ] Création booking en prebooking=true fonctionne
  - [ ] Authentification admin fonctionne
  - [ ] Settings checkout policy GET/PUT fonctionne
- [ ] **Tests de charge (optionnel)** :
  - [ ] Rate limiting fonctionne (> 60 req/h bloquées)
  - [ ] Cache recherche fonctionne (TTL 120s)
- [ ] **Monitoring** :
  - [ ] Logs Supabase → pas d'erreurs 500 récentes
  - [ ] Cloudflare Analytics (si Worker) → trafic entrant
  - [ ] GitHub Actions logs → pas de warnings

### 9.6 Documentation & Communication

- [ ] Changelog mis à jour (si applicable)
- [ ] THREAD.md mis à jour avec nouvel objectif / PR mergée
- [ ] Notification équipe (Slack/email) : "Version X.Y déployée en prod"
- [ ] Client informé si breaking changes ou nouvelles features visibles

### 9.7 Monitoring Post-Live (24-48h)

- [ ] Surveiller logs quotidiennement pendant 48h
- [ ] Vérifier métriques Cloudflare/Supabase (latence, taux d'erreur)
- [ ] Vérifier solde myGO (pas de consommation anormale)
- [ ] Répondre rapidement à tout incident (rollback si critique)

---

## 10. Contacts & Ressources

### 10.1 Liens utiles

- **Repository** : `https://github.com/hatemcha4ut/api.hotel.com.tn`
- **Supabase Dashboard** : `https://app.supabase.com/project/<project-ref>`
- **Cloudflare Dashboard** : `https://dash.cloudflare.com`
- **myGO Admin** : `https://admin.mygo.co`

### 10.2 Responsables

- **Développement backend** : [Nom/contact]
- **Admin Supabase** : [Nom/contact]
- **Admin Cloudflare** : [Nom/contact]
- **Contact myGO** : [Email support myGO]

---

## 11. Versioning de ce Document

| Version | Date | Auteur | Modifications |
|---------|------|--------|---------------|
| 1.0 | 2026-02-08 | Copilot Agent | Création initiale |

**Prochaines évolutions prévues :**
- [ ] Section détaillée sur le monitoring (Sentry, Datadog ?)
- [ ] Procédure de rollback automatisée
- [ ] Guide troubleshooting pour erreurs myGO fréquentes
- [ ] Documentation API complète (OpenAPI/Swagger)

---

## 12. Cloudflare Worker API

### 12.1 Complete API Reference

For complete API endpoint documentation, request/response schemas, and examples, see:

**[API_REFERENCE.md](./API_REFERENCE.md)** - Complete API documentation for all Cloudflare Worker endpoints

### 12.2 Key API Sections

- **Authentication**: Guest sessions, user registration, login
- **Profile Management**: WhatsApp consent and profile updates
- **Static Data**: Cities, countries, categories, boardings, tags, languages, currencies
- **Hotel Operations**: Search, detail, availability
- **Booking Flow**: Pre-booking, booking creation, booking retrieval
- **Checkout & Payments**: Credit check, ClicToPay integration, payment callbacks
- **Admin Operations**: Credit monitoring with SSE, settings management, booking management

### 12.3 Architecture Overview

```
┌─────────────────┐
│  www.hotel.com  │
│  admin.hotel.   │
│      com        │
└────────┬────────┘
         │ HTTPS
         ▼
┌─────────────────────┐
│ Cloudflare Worker  │
│  (api.hotel.com)   │
│                    │
│  • Hono Framework  │
│  • JWT Auth        │
│  • CORS Middleware │
│  • Rate Limiting   │
└──┬──────────────┬──┘
   │              │
   │ myGO API     │ ClicToPay
   │              │
   ▼              ▼
┌────────┐   ┌──────────┐
│  myGO  │   │ClicToPay │
│  Hotel │   │ Payment  │
│   API  │   │ Gateway  │
└────────┘   └──────────┘
   │
   │ Database
   ▼
┌─────────────┐
│  Supabase   │
│  Postgres   │
│             │
│  • bookings │
│  • payments │
│  • profiles │
│  • settings │
└─────────────┘
```

### 12.4 Environment Variables

All environment variables are configured as Cloudflare Worker secrets (never committed to code):

**Required Secrets:**
- `MYGO_LOGIN` - myGO API username
- `MYGO_PASSWORD` - myGO API password
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Backend service role key
- `SUPABASE_ANON_KEY` - Public anonymous key
- `SUPABASE_JWT_SECRET` - JWT verification secret
- `CLICTOPAY_USERNAME` - ClicToPay API username
- `CLICTOPAY_PASSWORD` - ClicToPay API password
- `CLICTOPAY_SECRET` - HMAC secret for callback verification
- `ALLOWED_ORIGINS` - Comma-separated CORS allowlist (e.g., "https://www.hotel.com.tn,https://admin.hotel.com.tn")

**Build-time Variables:**
- `GITHUB_SHA` - Git commit SHA (injected by CI/CD)
- `BUILT_AT` - Build timestamp (injected by CI/CD)
- `ENV` - Environment name (production/staging/development)

### 12.5 Deployment

Deployment is automated via GitHub Actions (`.github/workflows/deploy-worker.yml`):

```bash
# Manual deployment (from local)
npm install
wrangler deploy

# Verify deployment
curl https://api.hotel.com.tn/version
```

**Deployment Steps:**
1. Push to `main` branch
2. GitHub Actions builds Worker
3. Injects `GITHUB_SHA` and `BUILT_AT`
4. Deploys to Cloudflare
5. Verifies `/version` endpoint

### 12.6 Testing

```bash
# Install dependencies
npm install

# Type check
npm run type-check

# Run local development server
npm run dev

# Deploy to staging
wrangler deploy --env staging
```

### 12.7 Security Considerations

- **PII Masking**: All logs mask email, phone, WhatsApp numbers
- **Token Security**: Search tokens are stripped from API responses
- **HMAC Verification**: All ClicToPay callbacks are signature-verified
- **JWT Validation**: All authenticated endpoints verify Supabase JWT
- **Rate Limiting**: Cloudflare-level rate limiting per IP/user
- **CORS**: Strict origin allowlist (no wildcards)

### 12.8 Backward Compatibility

The Cloudflare Worker API maintains backward compatibility with existing Supabase Edge Functions:

- All Edge Function endpoints remain operational
- Worker adds new endpoints without breaking existing ones
- Frontend can gradually migrate to Worker endpoints
- Both systems share the same Supabase database

### 12.9 Migration Path

**Phase 1**: Deploy Worker alongside Edge Functions (current)
**Phase 2**: Update frontends to use Worker endpoints
**Phase 3**: Deprecate Edge Function endpoints
**Phase 4**: Remove Edge Functions (future)

---

