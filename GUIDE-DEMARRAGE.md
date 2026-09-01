# NeonUpscale — guide pour passer en vrai

Ce guide t'accompagne pour brancher les vrais comptes Google et les vrais paiements Stripe, puis mettre le site en ligne pour de bon. Compte environ 45 minutes à 1 heure la première fois. Tout ce qui est décrit ci-dessous est gratuit tant que tu restes en mode test / sur les paliers gratuits.

## Ce qui a déjà été codé

Le dossier `neonupscale-web/` contient un vrai site avec un vrai serveur (pas juste une page HTML) :

- connexion avec un compte Google réel (le bouton vérifie ton identité auprès de Google)
- une base de données qui retient qui est inscrit et quel abonnement il a pris
- de vrais paiements Stripe : 9,99€/semaine avec 3 jours d'essai gratuit, ou 19,99€ en achat unique à vie
- la 4K réservée à l'offre à vie, comme demandé

Il ne reste plus qu'à créer tes comptes (Google, Stripe, base de données, hébergement) et à coller leurs identifiants dans un fichier de configuration.

## Étape 1 — Créer ton compte Google Cloud (connexion "Se connecter avec Google")

1. Va sur [console.cloud.google.com](https://console.cloud.google.com) et connecte-toi avec ton compte Google.
2. En haut, crée un nouveau projet (ex: "NeonUpscale").
3. Dans le menu, va dans **APIs & Services > Écran de consentement OAuth**.
   - Type d'utilisateur : **Externe**.
   - Remplis le nom de l'app ("NeonUpscale"), ton email de contact. Tu peux laisser le reste par défaut et publier l'app en mode "Testing" pour commencer (jusqu'à 100 utilisateurs de test sans validation Google).
4. Toujours dans **APIs & Services**, va dans **Identifiants** > **Créer des identifiants** > **ID client OAuth**.
   - Type d'application : **Application Web**.
   - Origines JavaScript autorisées : ajoute `http://localhost:3000` (pour tester chez toi) et l'URL de ton site une fois hébergé (ex: `https://neonupscale.onrender.com`).
   - Pas besoin de "URI de redirection" pour ce type de connexion.
5. Une fois créé, copie le **Client ID** (il ressemble à `123456-abc.apps.googleusercontent.com`).

Tu colleras ce Client ID à deux endroits :
- dans le fichier `.env` du serveur (`GOOGLE_CLIENT_ID=...`)
- dans `public/index.html`, à la ligne `<meta name="google-signin-client_id" content="...">`

## Étape 2 — Créer ton compte Stripe (paiements)

1. Va sur [dashboard.stripe.com/register](https://dashboard.stripe.com/register) et crée un compte.
2. Tu arrives en **mode Test** par défaut (indiqué en haut à droite) — c'est parfait pour l'instant, aucun vrai argent ne circule.
3. Va dans **Produits** > **Ajouter un produit**, crée :
   - **Hebdomadaire** : prix récurrent, 9,99€, facturé toutes les semaines. Copie l'ID du prix (`price_...`).
   - **À vie** : prix unique, 19,99€ (paiement unique, pas récurrent). Copie l'ID du prix.
4. Va dans **Développeurs > Clés API**, copie la **clé secrète** (`sk_test_...`).
5. Va dans **Développeurs > Webhooks** > **Ajouter un endpoint**. L'URL sera `https://TON-SITE/api/webhooks/stripe` (tu ne pourras la créer qu'une fois le site en ligne — étape 4). Sélectionne les événements : `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copie le **secret de signature** (`whsec_...`).

**Important — quand tu seras prêt à encaisser du vrai argent :** Stripe demandera de vérifier ton identité et ton statut d'entreprise (auto-entrepreneur en France) avant d'activer les paiements réels, et tu devras ajouter des pages Mentions légales / CGV / Politique de confidentialité, avec la mention du droit de rétractation de 14 jours propre aux achats numériques en UE. Je ne suis ni juriste ni comptable — vérifie ces points avec un professionnel avant d'ouvrir les paiements au public. Je peux rédiger un brouillon de ces pages si tu veux, à faire relire ensuite.

## Étape 3 — Créer ta base de données (Neon, gratuit)

1. Va sur [neon.tech](https://neon.tech), crée un compte gratuit.
2. Crée un nouveau projet ("NeonUpscale").
3. Dans le tableau de bord, copie la **chaîne de connexion** (elle commence par `postgresql://...`).

## Étape 4 — Mettre le site en ligne (Render, gratuit)

1. Va sur [render.com](https://render.com), crée un compte gratuit (tu peux te connecter avec GitHub).
2. Mets le dossier `neonupscale-web` dans un dépôt GitHub (ou utilise l'option "déployer sans Git" de Render si tu préfères).
3. Dans Render, clique **New > Web Service**, connecte ton dépôt.
   - Build command : `npm install`
   - Start command : `npm start`
   - Choisis le plan **Free**.
4. Dans l'onglet **Environment**, ajoute toutes les variables du fichier `.env.example` avec tes vraies valeurs (Google, Stripe, Neon, et un `JWT_SECRET` aléatoire — génère-le avec `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). Mets `PUBLIC_URL` à l'adresse que Render t'attribue (ex: `https://neonupscale.onrender.com`).
5. Déploie. Une fois en ligne, reviens à l'étape 2.5 pour créer le webhook Stripe avec la vraie URL, et ajoute cette URL comme "Origine JavaScript autorisée" dans Google Cloud (étape 1.4).

Note : le plan gratuit de Render met le site en veille après 15 minutes sans visite (il se réveille en quelques secondes au visiteur suivant). C'est très bien pour commencer ; si le site prend du trafic, un plan payant (~7$/mois) évite ce délai de réveil.

## Tester en local avant de mettre en ligne

Si tu veux vérifier que tout fonctionne sur ton ordinateur avant de déployer :

```
cd neonupscale-web
npm install
cp .env.example .env
# remplis .env avec tes vraies valeurs (Google, Stripe test, Neon)
npm start
```

Puis ouvre `http://localhost:3000`. Pour tester un paiement, utilise la carte de test Stripe `4242 4242 4242 4242`, n'importe quelle date future, n'importe quel CVC.

## Ce qui manque encore pour un vrai lancement public

- Les pages légales (mentions légales, CGV, politique de confidentialité, droit de rétractation)
- Le passage de Stripe en mode Live (après vérification de ton identité/entreprise)
- La validation de l'écran de consentement Google si tu dépasses 100 utilisateurs de test
- Idéalement, un nom de domaine à toi plutôt que `*.onrender.com`

Dis-moi où tu en es une fois les comptes créés, et je t'aide à brancher les identifiants et à vérifier que tout fonctionne.
