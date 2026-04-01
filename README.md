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
