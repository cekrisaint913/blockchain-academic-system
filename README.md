# 🎓 Blockchain Academic System

Système de gestion académique décentralisé basé sur Hyperledger Fabric pour la gestion sécurisée des cours, examens et notes.

## 📋 Description

Ce projet implémente un système de gestion académique utilisant la technologie blockchain pour garantir l'intégrité, la traçabilité et la sécurité des données académiques. Le système permet :

- **Gestion des cours** : Création et publication de cours avec descriptions publiques
- **Contrôle d'accès granulaire** : Matériels de cours accessibles uniquement aux étudiants inscrits
- **Gestion des examens** : Publication différée des examens et corrections
- **Gestion des notes** : Stockage sécurisé et contrôle d'accès strict aux notes individuelles
- **Stockage décentralisé** : Intégration IPFS pour les documents et matériels de cours

## 🏗️ Architecture

```
blockchain-academic-system/
├── network/           # Configuration Hyperledger Fabric
├── chaincode/         # Smart contracts (Go)
├── backend/          # API REST (Node.js)
├── frontend/         # Interface utilisateur (React)
├── ipfs/             # Configuration IPFS
└── docs/             # Documentation
```

## 🚀 Technologies

### Blockchain

- **Hyperledger Fabric 2.5** : Infrastructure blockchain
- **Go** : Développement des chaincodes

### Backend

- **Node.js** : API REST
- **Express.js** : Framework web
- **JWT** : Authentification
- **Winston** : Logging
- **IPFS** : Stockage décentralisé

### Frontend

- **React** : Interface utilisateur
- **Material-UI / Tailwind CSS** : Design
- **Axios** : Communication API

### Infrastructure

- **Docker** : Containerisation
- **Docker Compose** : Orchestration

## 📦 Installation

### Prérequis

- Docker Desktop (version 20.10+)
- Node.js (version 18+)
- Go (version 1.20+)
- Git

### Configuration

1. **Cloner le repository**

```bash
git clone https://github.com/VOTRE_USERNAME/blockchain-academic-system.git
cd blockchain-academic-system
```

2. **Configurer le réseau Hyperledger Fabric**

```bash
cd network
./network.sh up createChannel -ca
./network.sh deployCC -ccn academic -ccp ../chaincode -ccl go
```

3. **Installer et démarrer le backend**

```bash
cd backend
npm install
cp .env.example .env
# Configurer les variables d'environnement dans .env
npm start
```

4. **Installer et démarrer le frontend**

```bash
cd frontend
npm install
npm start
```

5. **Démarrer IPFS (optionnel pour le développement)**

```bash
ipfs daemon
```

## 🔧 Configuration

### Variables d'environnement

Créez un fichier `.env` dans le dossier `backend/` :

```env
PORT=5173
NODE_ENV=development

# JWT
JWT_SECRET=votre_secret_jwt_ici
JWT_EXPIRE=24h

# Hyperledger Fabric
FABRIC_NETWORK_PATH=../network
CHANNEL_NAME=mychannel
CHAINCODE_NAME=academic
MSP_ID=Org1MSP

# IPFS
IPFS_HOST=localhost
IPFS_PORT=5001
IPFS_PROTOCOL=http

# Logging
LOG_LEVEL=info
```

## 🎯 Utilisation

### Interface Professeur

1. Connexion au système
2. Création de cours
3. Ajout de matériels pédagogiques
4. Création et publication d'examens
5. Saisie des notes

### Interface Étudiant

1. Connexion au système
2. Consultation des cours disponibles
3. Accès aux matériels des cours inscrits
4. Consultation des examens (selon disponibilité)
5. Consultation des notes personnelles

## 🔐 Sécurité

- **Authentification JWT** : Tokens sécurisés pour l'authentification
- **Contrôle d'accès basé sur les rôles** : Séparation stricte des permissions
- **Blockchain immuable** : Toutes les opérations sont enregistrées
- **Chiffrement des données sensibles** : Protection des informations personnelles
- **Audit logging** : Traçabilité complète des actions

## 🧪 Tests

```bash
# Tests unitaires
npm test

# Tests d'intégration
npm run test:integration

# Tests end-to-end
npm run test:e2e
```

## 📚 Documentation

Pour plus de détails :

- [Guide d'installation](docs/INSTALLATION.md)
- [Documentation API](docs/API.md)
- [Architecture blockchain](docs/ARCHITECTURE.md)
- [Guide de développement](docs/DEVELOPMENT.md)

## 🤝 Contribution

Les contributions sont les bienvenues ! Voici comment participer :

1. Fork le projet
2. Créez une branche pour votre feature (`git checkout -b feature/AmazingFeature`)
3. Committez vos changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## 📝 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 👥 Auteurs

- **Votre Nom** - _Développement initial_ - [VotreGitHub](https://github.com/votre-username)

---

.

