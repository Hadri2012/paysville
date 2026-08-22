# Hadrishop

Boutique en ligne complète et fonctionnelle : catalogue, fiches produits, panier,
checkout, paiement **Stripe**, gestion des commandes, du stock, des codes promo, des
zones de livraison et panneau d'administration protégé.

Le site est écrit en **HTML5 / CSS3 / JavaScript** (aucun framework CSS : la feuille de
style `app/globals.css` est écrite à la main) et **Next.js sert de backend intégré** :
route handlers, rendu serveur, sessions, secrets. Aucun serveur Express/Node séparé n'est
nécessaire.

---

## 1. Démarrage rapide

```bash
npm install
cp .env.example .env.local     # puis remplissez les variables (voir §3)
npm run dev                    # http://localhost:3000
```

Au premier démarrage, la boutique est automatiquement initialisée avec le catalogue
Hadrishop (P2 → P14) et la zone de livraison 1435 (Mont-Saint-Guibert, Corbais,
Hévillers). Tout est ensuite modifiable depuis `/admin`.

Autres commandes :

```bash
npm run build      # build de production
npm start          # serveur de production
npm run typecheck  # vérification TypeScript
npm run lint       # ESLint
npm run selftest   # tests de la logique métier (stock, réservations, promos, livraison)
```

---

## 2. Ce que vous devez renseigner vous-même

Ces valeurs ne peuvent pas être devinées : elles vous appartiennent.

| Variable | Où la trouver | Obligatoire |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Stripe → Développeurs → Clés API (`sk_live_…` / `sk_test_…`) | ✅ pour encaisser |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Développeurs → Webhooks (`whsec_…`) | ✅ en production |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | vous les choisissez | ✅ première connexion |
| `NEXT_PUBLIC_SITE_URL` | votre domaine définitif | recommandé |
| `DATABASE_URL` | votre base PostgreSQL | ✅ en production |

Les informations légales (dénomination, adresse, TVA, e-mail de contact) se saisissent
dans **/admin → Paramètres** : elles alimentent les CGV, la politique de confidentialité
et le pied de page. Tant qu'elles sont vides, un avertissement s'affiche dans
l'administration et sur les pages légales.

> Aucune clé Stripe n'est jamais envoyée au navigateur : l'intégration utilise Stripe
> Checkout en redirection, qui ne nécessite même pas de clé publiable.

---

## 3. Configuration Stripe (pas à pas)

1. **Clé secrète** : copiez `sk_test_…` dans `STRIPE_SECRET_KEY`.
2. **Webhook** : créez un endpoint vers
   `https://VOTRE-DOMAINE/api/stripe/webhook` et sélectionnez les événements :
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.expired`
   - `checkout.session.async_payment_failed`
   - `payment_intent.payment_failed`
   - `charge.refunded`
3. Copiez le secret `whsec_…` dans `STRIPE_WEBHOOK_SECRET`.
4. En local, vous pouvez utiliser la CLI Stripe :
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

L'URL exacte du webhook est rappelée dans **/admin → Paramètres**, avec l'état de la
configuration (clé présente ou non, webhook présent ou non).

### Comment le paiement est sécurisé

1. Le navigateur n'envoie que des **identifiants de produits et des quantités**.
2. Le serveur relit les produits, vérifie qu'ils sont actifs, contrôle le **stock réel**,
   récupère les **vrais prix**, applique le code promo et calcule les frais de livraison.
3. Le stock est **réservé** (15 minutes par défaut, réglable) et la commande est créée
   au statut « En attente de paiement ».
4. La session Stripe Checkout est créée **côté serveur** à partir de ces montants.
5. Le client paie sur les pages hébergées par Stripe.
6. Le **webhook signé** confirme le paiement : la commande passe en « Paiement confirmé »
   et le stock est définitivement décrémenté. Le traitement est **idempotent**.
7. La page de succès ne prouve jamais le paiement à elle seule : elle interroge Stripe
   côté serveur (`checkout.sessions.retrieve`) pour connaître l'état réel.

Si la réservation expire sans paiement, le stock est automatiquement libéré et la
commande est annulée.

---

## 4. Base de données

Next.js ne fournit pas de base de données : c'est la **seule** brique complétée ici, avec
la solution la plus simple possible — un document JSON unique manipulé de façon
transactionnelle (`lib/store.ts`), avec deux pilotes :

| Pilote | Activation | Usage |
| --- | --- | --- |
| **PostgreSQL** | `DATABASE_URL` défini | **Production.** Transactions `SELECT … FOR UPDATE` : deux clients ne peuvent pas réserver le même dernier exemplaire. Les données survivent aux déploiements. |
| **Fichier** | par défaut | Développement local (`.data/hadrishop.json`), écritures atomiques sérialisées par un mutex. |

La table est créée automatiquement au premier accès :

```sql
CREATE TABLE hadrishop_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ);
```

> ⚠️ Sur un hébergement au système de fichiers éphémère (Vercel, conteneurs), **définissez
> `DATABASE_URL`**, sinon les données seront perdues à chaque déploiement. Un
> avertissement s'affiche dans le tableau de bord admin tant que ce n'est pas le cas.

Données conservées : produits, stocks, commandes, clients liés aux commandes, promotions,
zones de livraison, réservations, comptes et sessions admin, paramètres.

---

## 5. Administration

`/admin` — protégé par authentification (cookie de session `httpOnly`, `SameSite=Lax`,
`Secure` en production ; mot de passe haché avec **scrypt** + sel, jamais en clair).

| Section | Ce que vous pouvez faire |
| --- | --- |
| Tableau de bord | chiffre d'affaires, nombre de commandes, commandes récentes, à préparer, produits actifs, stock faible, ruptures |
| Commandes | liste, recherche, filtres (date, statut, paiement, client), détail complet, changement de statut, note interne |
| Produits | créer, modifier (nom, référence, description, prix, stock, image, catégorie, ordre), activer/désactiver, archiver ou supprimer |
| Stocks | vue rapide (stock, réservé, disponible, alerte) et modification immédiate |
| Promotions | créer/modifier/activer/supprimer un code, remise fixe ou en %, dates, minimum d'achat, limite et compteur d'utilisations |
| Livraison | ajouter/retirer des codes postaux et des communes, frais par zone, frais par défaut, seuil de livraison offerte, durée de réservation |
| Paramètres | e-mail de contact, informations légales, état de la configuration technique |

**Première connexion** : renseignez `ADMIN_EMAIL` et `ADMIN_PASSWORD`, puis connectez-vous
sur `/admin/login`. Le compte est créé et le mot de passe haché à ce moment-là. Le public
ne peut pas créer de compte administrateur.

### Statuts de commande

`En attente de paiement` → `Paiement confirmé` → `En préparation` → `Prête` → `Expédiée` →
`Livrée`, plus `Annulée` et `Remboursée`. Passer une commande payée en « Annulée » ou
« Remboursée » **remet automatiquement les articles en stock**.

---

## 6. Images produits

Next.js n'inclut pas de stockage de fichiers. Deux possibilités, sans service externe :

- **URL d'image** dans la fiche produit de l'admin (`https://…`, ou un chemin local comme
  `/images/porte-casque.jpg` si vous déposez le fichier dans `public/images/`).
- **Rien du tout** : un visuel est généré automatiquement (SVG en data-URI, initiales +
  référence), ce qui garantit un catalogue présentable dès le premier jour.

---

## 7. Sécurité et vie privée

- Toutes les validations sont refaites **côté serveur** (formulaire, panier, stock, promo,
  zone de livraison, total).
- Le frontend ne décide jamais du prix, de la remise, du stock ni du statut de paiement.
- Protection XSS par l'échappement automatique de React ; aucun `dangerouslySetInnerHTML`.
- Protection CSRF : cookie `SameSite=Lax` + vérification de l'origine sur toute opération
  modifiante.
- Limitation de débit sur la connexion admin, la commande, le suivi et le recalcul de panier.
- En-têtes de sécurité (`nosniff`, `X-Frame-Options`, `Referrer-Policy`, HSTS en production).
- Une commande n'est consultable qu'avec **son numéro ET l'e-mail utilisé** (ou le jeton
  d'accès unique du lien de confirmation) : deviner un numéro ne suffit pas.
- **Aucune donnée bancaire n'est stockée** : Stripe gère intégralement le paiement.
- Case CGV obligatoire ; case marketing facultative, séparée et décochée par défaut.
- **Aucune dépendance Twilio**, aucun SMS, aucune clé Twilio nulle part.

---

## 8. E-mails transactionnels

Next.js n'embarque pas d'envoi d'e-mails et aucun service payant n'a été ajouté : la
commande et le paiement fonctionnent parfaitement sans. Le client retrouve sa commande
via la page **Suivi de commande** (numéro + e-mail) et via le lien de confirmation.
Stripe envoie de son côté un reçu de paiement si vous activez cette option dans votre
tableau de bord Stripe (Paramètres → E-mails clients) — c'est la façon la plus simple
d'avoir une confirmation par e-mail sans service supplémentaire.

---

## 9. Structure du projet

```
app/
  (shop)/            pages publiques : accueil, boutique, produit, panier,
                     commande, confirmation, suivi, livraison, CGV, confidentialité
  admin/             panneau d'administration (protégé)
  api/               backend intégré
    products/        catalogue public
    cart/quote/      recalcul serveur du panier
    checkout/        création de commande + session Stripe
    stripe/webhook/  confirmation signée des paiements
    orders/track/    suivi sécurisé
    admin/…          opérations d'administration (authentifiées)
  globals.css        design system CSS3 (responsive, mobile-first)
components/          composants d'interface (panier, cartes produits, admin)
lib/
  store.ts           persistance transactionnelle (PostgreSQL / fichier)
  shop.ts            stock, réservations, promotions, livraison, calcul du panier
  orders.ts          commandes, numérotation, confirmation de paiement
  stripe.ts          intégration Stripe (serveur uniquement)
  payments.ts        réconciliation Stripe ↔ commandes
  auth.ts            authentification admin (scrypt + sessions)
  validation.ts      validation serveur des entrées
scripts/selftest.ts  tests de la logique métier
```

---

## 10. Déploiement

1. Définissez les variables d'environnement (§2) chez votre hébergeur, **`DATABASE_URL`
   compris**.
2. `npm run build` puis `npm start` (ou déploiement automatique type Vercel).
3. Déclarez le webhook Stripe vers `https://VOTRE-DOMAINE/api/stripe/webhook`.
4. Connectez-vous à `/admin`, complétez les Paramètres, vérifiez le catalogue.
5. Faites une commande de test avec une carte de test Stripe (`4242 4242 4242 4242`),
   puis vérifiez dans l'admin que la commande passe bien en « Paiement confirmé » et que
   le stock a diminué.

HTTPS est assuré par l'hébergeur ; HSTS est activé automatiquement en production.
