# VéloLoc

Site de **demande de location de vélo** (vélo normal / vélo électrique), avec
interface administrateur pour accepter ou refuser chaque demande. **Aucun prix,
aucun paiement en ligne** : le site gère uniquement le cycle de vie des
demandes, de l'envoi par le client à la décision de l'administrateur.

Écrit en **TypeScript / Next.js (App Router)**, avec une feuille de style CSS3
écrite à la main (`app/globals.css`, sans framework). Next.js sert de backend
intégré : route handlers, rendu serveur, sessions, secrets. Aucun serveur
séparé n'est nécessaire.

---

## 1. Démarrage rapide

```bash
npm install
cp .env.example .env.local     # puis renseignez ADMIN_EMAIL / ADMIN_PASSWORD (voir §3)
npm run dev                    # http://localhost:3000
```

Au premier démarrage, le site est initialisé avec deux vélos (normal et
électrique), tous deux disponibles. Tout est ensuite modifiable depuis
`/admin`.

Autres commandes :

```bash
npm run build      # build de production
npm start          # serveur de production
npm run typecheck  # vérification TypeScript
npm run lint       # ESLint
npm run selftest   # tests de la logique métier (demandes, disponibilité, admin)
```

---

## 2. Fonctionnement général

1. Le client arrive sur le site et choisit **vélo normal** ou **vélo
   électrique**.
2. Il remplit un formulaire (coordonnées, période souhaitée, message
   facultatif, acceptation des conditions).
3. La demande est créée avec un **numéro unique** (ex. `VL-2026-7K3F9Q`) et
   reste **« En attente »** — elle n'est jamais acceptée automatiquement.
4. L'administrateur consulte la demande dans `/admin/demandes`, et peut
   l'**accepter** ou la **refuser**. C'est seulement à l'acceptation que la
   période est effectivement réservée pour ce vélo.
5. Le client peut suivre le statut de sa demande à tout moment depuis
   `/suivi`, avec son numéro de demande **et** son adresse e-mail (les deux
   sont nécessaires : deviner un numéro ne suffit pas).

Chaque vélo (normal / électrique) est une ressource indépendante : deux
demandes acceptées sur le même vélo ne peuvent jamais se chevaucher, mais le
vélo normal et le vélo électrique peuvent être loués en même temps par deux
personnes différentes. Une demande en attente ne bloque rien — seule
l'acceptation réserve la période, et la disponibilité est **revérifiée côté
serveur au moment de l'acceptation** pour empêcher toute double réservation
(deux onglets admin ouverts en même temps, par exemple).

---

## 3. Ce que vous devez renseigner vous-même

| Variable | Où la trouver | Obligatoire |
| --- | --- | --- |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | vous les choisissez | ✅ première connexion |
| `DATABASE_URL` | votre base PostgreSQL | ✅ en production |
| `NEXT_PUBLIC_SITE_URL` | votre domaine définitif | recommandé |
| `RESEND_API_KEY` / `EMAIL_FROM` | [resend.com](https://resend.com) | optionnel (e-mails) |

### Créer le compte administrateur

Il n'existe pas de formulaire d'inscription admin (volontairement : le public
ne doit jamais pouvoir créer de compte administrateur). À la place :

1. Renseignez `ADMIN_EMAIL` et `ADMIN_PASSWORD` dans les variables
   d'environnement.
2. Connectez-vous une première fois sur `/admin/login` avec ces identifiants.
3. Le compte est créé à cet instant précis, avec le mot de passe **haché**
   (scrypt + sel) en base — jamais stocké en clair. Vous pouvez ensuite
   retirer `ADMIN_PASSWORD` des variables d'environnement si vous le
   souhaitez : le compte existe déjà en base.

---

## 4. Base de données

Next.js ne fournit pas de base de données : c'est la seule brique complétée
ici, avec la solution la plus simple possible — un document JSON unique
manipulé de façon transactionnelle (`lib/store.ts`), avec deux pilotes :

| Pilote | Activation | Usage |
| --- | --- | --- |
| **PostgreSQL** | `DATABASE_URL` défini | **Production.** Transactions `SELECT … FOR UPDATE` : deux acceptations simultanées ne peuvent jamais réserver deux fois la même période pour le même vélo. Les données survivent aux déploiements. |
| **Fichier** | par défaut | Développement local (`.data/veloloc.json`), écritures atomiques sérialisées par un mutex. |

```sql
CREATE TABLE veloloc_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ);
```

Le document conserve : administrateurs, vélos (normal / électrique),
demandes de location, et pour chaque demande son **historique complet des
changements de statut** (horodaté).

> ⚠️ Sur un hébergement au système de fichiers éphémère (Vercel, conteneurs),
> **définissez `DATABASE_URL`**, sinon les données seraient perdues à chaque
> déploiement — le site refuse de démarrer sans base sur Vercel plutôt que de
> perdre silencieusement des données.

---

## 5. Administration (`/admin`)

Protégée par authentification (cookie de session `httpOnly`, `SameSite=Lax`,
`Secure` en production ; mot de passe haché avec **scrypt** + sel, jamais en
clair). Toute page `/admin/*` redirige vers `/admin/login` si la session est
absente ; toute route API `/api/admin/*` renvoie `401` sans session valide.

| Section | Ce que vous pouvez faire |
| --- | --- |
| Tableau de bord | demandes en attente / acceptées / refusées, prochaines locations, disponibilité en temps réel des deux vélos |
| Demandes | liste filtrable (Toutes / En attente / Acceptées / Refusées / Terminées), recherche, détail complet, **Accepter** / **Refuser**, commentaire visible par le client, note interne, changement de statut manuel, annulation, suppression |
| Calendrier | vue mensuelle des locations acceptées, un vélo par couleur |
| Vélos | nom affiché, description, photo, caractéristiques, disponibilité générale (activer/désactiver) pour chacun des deux vélos |

### Acceptation d'une demande

Cliquer sur « Accepter » revérifie **toujours** côté serveur, dans la même
transaction que l'écriture :

1. que le vélo est toujours actif (pas désactivé entre-temps) ;
2. qu'aucune autre demande **acceptée** sur ce même vélo ne chevauche la
   période demandée.

Si l'une de ces conditions échoue, l'acceptation est refusée avec un message
d'erreur explicite et rien n'est modifié.

---

## 6. E-mails transactionnels

Le site fonctionne **entièrement sans service d'e-mail configuré** — les
demandes sont créées, acceptées, refusées, consultées normalement ; seules
les notifications automatiques sont simplement désactivées (et journalisées
côté serveur avec `console.log`, pratique en développement).

Avec `RESEND_API_KEY` et `EMAIL_FROM` renseignés (API HTTP de
[Resend](https://resend.com), aucune dépendance SMTP à installer) :

- **Nouvelle demande** → confirmation au client + notification à
  `ADMIN_EMAIL`.
- **Demande acceptée** → e-mail au client (avec le commentaire éventuel de
  l'administrateur).
- **Demande refusée** → e-mail au client (idem).

Une panne du service d'e-mail n'empêche jamais la demande ou la décision
admin d'aboutir : l'envoi est best-effort, journalisé en cas d'échec.

---

## 7. Sécurité

- Mot de passe admin haché (**scrypt** + sel aléatoire), jamais stocké ni
  envoyé en clair ; comparaison en temps constant.
- Session admin par cookie `httpOnly`, `SameSite=Lax`, `Secure` en
  production — jamais de jeton exposé au JavaScript client.
- **Toutes** les décisions importantes (acceptation, vérification de
  disponibilité, statut) sont prises **côté serveur** ; le frontend ne fait
  qu'afficher l'état renvoyé par l'API.
- Validation serveur complète du formulaire de demande (en plus de la
  validation côté navigateur) : prénom/nom, e-mail, téléphone, cohérence des
  dates, conditions acceptées.
- Protection CSRF : vérification d'origine sur toute requête modifiante,
  cookie `SameSite=Lax`.
- Protection XSS : React échappe automatiquement tout contenu, aucun
  `dangerouslySetInnerHTML`.
- Limitation de débit (rate limiting) sur la connexion admin et sur l'envoi
  de demandes.
- Toutes les routes `/admin` et `/api/admin/*` exigent une session valide.
- Une demande n'est consultable qu'avec **son numéro ET l'e-mail utilisé** :
  deviner un numéro ne suffit jamais.
- Secrets uniquement dans les variables d'environnement ; aucune clé privée
  accessible depuis le navigateur.
- En-têtes de sécurité (`nosniff`, `X-Frame-Options`, `Referrer-Policy`, HSTS
  en production).

---

## 8. Structure du projet

```
app/
  (public)/           pages publiques : accueil, demande/[normal|electric], suivi
  admin/               panneau d'administration (protégé)
    demandes/           liste + détail des demandes
    calendrier/         vue calendrier des locations acceptées
    velos/               réglages des deux vélos
  api/
    requests/            création de demande (public) + suivi
    admin/requests/[id]  accepter / refuser / annuler / commenter / supprimer
    admin/bikes/[kind]   réglages d'un vélo
    admin/login|logout    authentification admin
  globals.css           design system CSS3 (responsive, mobile-first)
components/             composants d'interface (formulaire, badges, admin)
lib/
  store.ts              persistance transactionnelle (PostgreSQL / fichier)
  requests.ts            création, acceptation, refus, annulation des demandes
  availability.ts        détection de chevauchement, disponibilité en temps réel
  bikes.ts                réglages des vélos
  auth.ts                 authentification admin (scrypt + sessions)
  email.ts                notifications (Resend, optionnel)
  validation.ts / datetime.ts   validation et gestion des dates/heures
scripts/selftest.ts     tests de la logique métier
```

---

## 9. Déploiement

1. Définissez les variables d'environnement (§3) chez votre hébergeur,
   **`DATABASE_URL` compris**.
2. `npm run build` puis `npm start` (ou déploiement automatique type Vercel).
3. Connectez-vous à `/admin/login` avec `ADMIN_EMAIL` / `ADMIN_PASSWORD` pour
   créer le compte administrateur.
4. Personnalisez les deux vélos (photo, description, caractéristiques) depuis
   `/admin/velos`.

HTTPS est assuré par l'hébergeur ; HSTS est activé automatiquement en
production.
