## Solution d'A/B testing – module fédéré

Ce répertoire contient la solution d'A/B testing interne exposée sous forme de module fédéré.

- `apps/api` : service Node/Express qui expose l'API HTTP (CRUD campagnes/segments, `/api/evaluate`) et lit/écrit les fichiers JSON dans `abtest-campaigns-segments`.
- `apps/remote` : remote/module fédéré consommé par le site hôte (ex. `small-webserver`). Il expose des composants et une API JS pour charger les campagnes front et injecter les scripts/styles.
- `apps/ui` : interface d'administration (React) pour gérer campagnes et segments, et générer les liens de simulation.
- `packages/core` : moteur d'A/B testing (modèle de données, bucketing, ports `Storage` et `Tracking`).
- `packages/storage-fs` : adaptateur de stockage filesystem branché sur `abtest-campaigns-segments`.
- `abtest-campaigns-segments` : dépôt de campagnes et segments (JSON + JS/CSS des variations).
