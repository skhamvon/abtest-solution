## abtest-solution

Ce dépôt contient la **solution d’A/B testing** elle-même : moteur de décision, API, interface d’admin et remote/module fédéré consommable par un site hôte (par exemple le `small-webserver`).

### Structure principale

- `apps/api` : service Node/Express qui expose l’API HTTP (CRUD campagnes/segments, `/api/evaluate`), basée sur les fichiers du dépôt `abtest-campaigns-segments`.
- `apps/remote` : remote / module fédéré, chargé par le site hôte pour afficher les variations et intégrer la logique A/B.
- `apps/ui` : interface d’administration (React) pour gérer campagnes et segments.
- `packages/core` : moteur cœur (modèle de données, bucketing, ports « storage » / « tracking »).
- `packages/storage-fs` : adaptateur de stockage fichier, branché sur le dépôt `abtest-campaigns-segments`.
- `abtest-campaigns-segments` : **submodule Git** contenant les campagnes et segments (JSON, JS, CSS).

### Prérequis

- Node.js **20+** (avec `npm`).
- Avoir cloné le dépôt parent `hackathon-abtest` avec ses submodules, ou avoir initialisé ce dépôt avec son submodule `abtest-campaigns-segments`.

Depuis la racine de `abtest-solution` :

```bash
npm install
```

Si besoin, copie le fichier d’exemple d’environnement (s’il existe) et adapte les valeurs :

```bash
cp .env.example .env   # si présent
```

### Initialiser / mettre à jour le submodule des campagnes

Si ce n’est pas déjà fait :

```bash
git submodule update --init abtest-campaigns-segments
```

Pour mettre à jour le contenu (après un `git pull` dans le dépôt des campagnes, ou une mise à jour distante) :

```bash
git submodule update --init --remote abtest-campaigns-segments
```

Pense ensuite à committer le nouveau pointeur de submodule dans `abtest-solution` :

```bash
git add abtest-campaigns-segments
git commit -m "chore: update campaigns/segments submodule pointer"
```

### Démarrer les services (exemple)

Les scripts exacts peuvent évoluer selon la configuration du monorepo, mais un scénario typique est :

- lancer l’API (par ex. `apps/api`),
- lancer le remote/module fédéré,
- lancer l’UI d’administration.

Par exemple (à adapter à tes scripts npm actuels) :

```bash
# Exemple si un script existe pour tout lancer en dev
npm run dev
```

Consulte la section `scripts` des différents `package.json` dans `apps/*` pour les commandes détaillées (dev, build, test, etc.).

### Variables d’environnement utiles (ports)

Pour faciliter les démos (locales ou en conteneur), les ports des services principaux sont configurables via variables d’environnement :

- **API** (`apps/api`) :

  - Variable : `PORT`
  - Défaut : `5002`
  - Exemple : `PORT=8080 npm run dev --workspace apps/api`

- **UI d’administration** (`apps/ui`) :

  - Variable : `VITE_UI_PORT`
  - Défaut : `5174`
  - Exemple : `VITE_UI_PORT=3001 npm run dev --workspace apps/ui`

- **Remote / module fédéré** (`apps/remote`) :
  - Variable : `VITE_REMOTE_PORT`
  - Défaut : `5001`
  - Exemple : `VITE_REMOTE_PORT=5100 npm run dev --workspace apps/remote`

En l’absence de ces variables, les valeurs par défaut sont utilisées. Pour une démo derrière une URL du type `http://monhost:xxxx`, il est souvent suffisant d’exposer le port interne choisi (`PORT`, `VITE_UI_PORT`, etc.) avec un mapping de port Docker ou un reverse proxy, sans modifier le code.
