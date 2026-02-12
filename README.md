# Systeme Academique Blockchain

Systeme de gestion academique decentralise sur **Hyperledger Fabric 2.5**.
Gestion securisee et tracable des classes, inscriptions, examens, supports de cours et notes.

---

## Pourquoi la blockchain ?

| Probleme classique | Solution blockchain |
|--------------------|---------------------|
| Notes modifiables apres coup | Registre immutable, chaque note est une transaction |
| Fraude sur les diplomes | Verification instantanee via hash cryptographique |
| Perte de donnees | Replication sur plusieurs noeuds |
| Manque de transparence | Historique complet et horodate |
| Confiance centralisee | Consensus distribue entre organisations |

---

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Dashboard HTML  │────▶│  API Express     │────▶│  Hyperledger Fabric │
│  (Tailwind CSS)  │     │  (Node.js)       │     │  (Chaincode JS)     │
└──────────────────┘     └────────┬─────────┘     └─────────────────────┘
                                  │
                            Scripts shell
                          (docker exec peer)
```

L'API communique avec le chaincode Fabric via des scripts shell
qui lancent `peer chaincode query/invoke` dans le conteneur CLI Docker.

### Reseau Fabric

| Composant | Adresse |
|-----------|---------|
| Orderer | orderer.academic.edu:7050 |
| Peer School (profs) | peer0.school.academic.edu:7051 |
| Peer Students | peer0.students.academic.edu:9051 |
| CA Orderer | ca_orderer |
| CA School | ca_school:8054 |
| CA Students | ca_students:9054 |
| CLI | cli (conteneur d'administration) |

**Canal** : `academic-channel`
**Chaincode** : `academic-cc` (Node.js, multi-contrat)

### Organisations

| MSP | Domaine | Role |
|-----|---------|------|
| SchoolMSP | school.academic.edu | Professeurs, administration |
| StudentsMSP | students.academic.edu | Etudiants |

---

## Structure du projet

```
blockchain-academic-system/
├── README.md                              # Ce fichier
│
└── network-new/                           # Projet actif
    ├── network.sh                         # Script principal du reseau
    ├── configtx.yaml                      # Configuration organisations + canal
    ├── crypto-config.yaml                 # Topologie des certificats
    ├── docker-compose-network.yaml        # Conteneurs Fabric (peers, orderer, CLI)
    ├── docker-compose-ca.yaml             # Autorites de certification
    ├── peer-base.yaml                     # Configuration de base des peers
    ├── core.yaml                          # Configuration Fabric core
    ├── clean-all.sh                       # Nettoyage complet
    │
    ├── scripts/
    │   ├── createChannel.sh               # Creation du canal academic-channel
    │   ├── deployChaincode.sh             # Installation et instanciation du chaincode
    │   ├── queryChaincode.sh              # Requete chaincode (lecture)
    │   ├── invokeChaincode.sh             # Transaction chaincode (ecriture)
    │   └── demo.sh                        # Scenario de demo complet
    │
    ├── chaincode/academic-cc/             # Smart contracts (Node.js)
    │   ├── index.js                       # Point d'entree multi-contrat
    │   ├── lib/class.js                   # ClassContract : classes + inscriptions
    │   ├── lib/material.js                # AcademicContract : supports de cours
    │   ├── lib/exam.js                    # AcademicContract : examens
    │   └── lib/grade.js                   # AcademicContract : notes
    │
    ├── api/                               # Serveur API REST
    │   ├── server.js                      # Point d'entree Express (port 4000)
    │   ├── routes/demo.js                 # Routes de demo (via scripts shell)
    │   ├── public/index.html              # Dashboard web (interface unique)
    │   ├── config/connection-profile.json # Profil de connexion Fabric
    │   ├── middleware/auth.js             # Authentification JWT (mode SDK)
    │   ├── routes/classes.js              # Routes SDK classes (optionnel)
    │   ├── routes/materials.js            # Routes SDK supports (optionnel)
    │   ├── services/fabricService.js      # Client Fabric SDK (optionnel)
    │   └── services/ipfsService.js        # Client IPFS (optionnel)
    │
    ├── crypto-config/                     # Certificats generes par cryptogen
    ├── channel-artifacts/                 # Artefacts du canal (genesis, transactions)
    └── organizations/                     # MSP des organisations
```

---

## Demarrage

### Prerequis

- Docker et Docker Compose
- Hyperledger Fabric 2.5 binaires (cryptogen, configtxgen, peer)
- Node.js 16+

### Installation des binaires Fabric

```bash
curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh --fabric-version 2.5.0 binary
export PATH=$PATH:$(pwd)/bin
```

### Lancer le reseau

```bash
cd network-new

# Tout en une commande (crypto + reseau + canal + chaincode)
./network.sh all

# Ou etape par etape :
./network.sh generate        # Generer certificats + artefacts canal
./network.sh up              # Demarrer les conteneurs Docker
./network.sh createChannel   # Creer le canal academic-channel
./network.sh deployCC        # Deployer le chaincode academic-cc
```

### Lancer l'API

```bash
cd network-new/api
npm install
node server.js               # Demarre sur http://localhost:4000
```

Le dashboard web est accessible sur `http://localhost:4000`.

### Arreter le reseau

```bash
cd network-new
./network.sh down            # Arrete les conteneurs, supprime les volumes
```

---

## Routes API (mode demo)

Toutes les routes sont accessibles sans authentification (mode demo pour la soutenance).

| Methode | Route | Description |
|---------|-------|-------------|
| POST | `/api/init` | Initialise la demo (4 classes, 4 etudiants) |
| GET | `/api/classes` | Liste toutes les classes |
| GET | `/api/classes/:id` | Detail d'une classe avec inscrits |
| POST | `/api/classes` | Creer une classe |
| POST | `/api/classes/:id/enroll` | Inscrire un etudiant |
| GET | `/api/classes/:classId/materials` | Supports d'une classe |
| POST | `/api/materials` | Ajouter un support de cours |
| GET | `/api/exams` | Liste de tous les examens |
| POST | `/api/exams` | Planifier un examen |
| GET | `/api/grades` | Toutes les notes |
| POST | `/api/grades` | Soumettre une note |
| POST | `/api/grades/:id/publish` | Publier une note (la rendre visible) |
| GET | `/health` | Verification que le serveur tourne |

### Format des reponses

```json
{ "success": true,  "data": { ... } }
{ "success": false, "error": "Message d'erreur" }
```

---

## Fonctions du chaincode

Le chaincode `academic-cc` est compose de deux contrats appeles au format `ContractName:FunctionName`.

### ClassContract

| Fonction | Type | Description |
|----------|------|-------------|
| `CreateClass` | Submit | Creer une classe (id, nom, description) |
| `GetAllClasses` | Evaluate | Liste de toutes les classes |
| `GetClassDetails` | Evaluate | Detail complet avec liste des inscrits |
| `EnrollStudent` | Submit | Inscrire un etudiant dans une classe |
| `GetEnrolledStudents` | Evaluate | Liste des inscrits d'une classe |

### AcademicContract

| Fonction | Type | Description |
|----------|------|-------------|
| `UploadMaterial` | Submit | Ajouter un support (cours, TP, correction) |
| `GetClassMaterials` | Evaluate | Supports d'une classe |
| `CreateExam` | Submit | Planifier un examen avec date |
| `GetAllExams` | Evaluate | Liste de tous les examens |
| `SubmitGrade` | Submit | Soumettre une note (etat: non publiee) |
| `PublishGrade` | Submit | Publier une note (la rendre visible) |
| `GetAllGrades` | Evaluate | Toutes les notes |

### Cles d'etat (prefixes)

| Prefixe | Entite |
|---------|--------|
| `CLASS_` | Classes |
| `ENR_` | Inscriptions |
| `MAT_` | Supports de cours |
| `EXAM_` | Examens |
| `GRADE_` | Notes |

### Modeles de donnees

**Classe** :
```json
{
  "docType": "class", "id": "CYBER101",
  "name": "Cybersecurite",
  "description": "Securite informatique, cryptographie, pentest",
  "enrolledStudents": ["Alice", "Bob"],
  "createdAt": "2026-02-10T14:00:00Z"
}
```

**Note** :
```json
{
  "docType": "grade", "gradeId": "GR-EX-CYBER101-1-Alice",
  "examId": "EX-CYBER101-1", "studentId": "Alice",
  "score": 16, "maxScore": 20,
  "comments": "Bon travail",
  "isPublished": true,
  "submittedAt": "2026-02-10T15:30:00Z"
}
```

---

## Regles metier

### 4 contraintes du cahier des charges

**1. Classes accessibles a tous**
La description et l'organisation de chaque classe sont visibles publiquement.
Route `GET /api/classes` sans authentification.

**2. Supports visibles par les inscrits**
Les supports de cours et TP sont accessibles uniquement aux etudiants inscrits dans la classe.
Verification d'inscription dans le chaincode.

**3. Examens et corrections disponibles 24h apres**
Les examens et leurs corrections sont accessibles 24 heures apres la date de l'examen.
Verification temporelle dans le chaincode via `ctx.stub.getTxTimestamp()`.

**4. Notes visibles uniquement par l'etudiant concerne**
Chaque etudiant n'a acces qu'a ses propres notes, et seulement apres publication par le professeur.
Deux etats : soumise (invisible) puis publiee (visible).

### Regles supplementaires

- Un etudiant ne peut appartenir qu'a **une seule classe**
- Seul le **professeur** inscrit un etudiant dans une classe
- Les supports sont de trois types : **Cours**, **TP**, **Correction**
- Les notes sont sur **20 points**

---

## Securite

| Couche | Mecanisme |
|--------|-----------|
| Reseau | TLS entre peers, orderer et CA |
| Identites | Certificats X.509 via Fabric CA (PKI) |
| Chaincode | Controle d'acces par MSP (SchoolMSP / StudentsMSP) |
| API (demo) | Sanitization des entrees shell contre l'injection |
| API (SDK) | JWT + RBAC (roles: student, teacher, admin) |
| Frontend | Echappement HTML (XSS prevention) |
| Blockchain | Immutabilite du registre, consensus distribue |

---

## Technologies

| Couche | Technologie |
|--------|-------------|
| Frontend | HTML, Tailwind CSS (CDN), JavaScript vanilla |
| Backend | Express 4.18, Node.js 18+ |
| Blockchain | Hyperledger Fabric 2.5 |
| Smart Contracts | Node.js (fabric-contract-api) |
| Infrastructure | Docker, Docker Compose |
| Certificats | cryptogen (Fabric) |

---

## Tester le chaincode directement

```bash
cd network-new

# Lister les classes
./scripts/queryChaincode.sh ClassContract:GetAllClasses

# Creer une classe
./scripts/invokeChaincode.sh ClassContract:CreateClass MATH101 Maths "Algebre et analyse"

# Inscrire un etudiant
./scripts/invokeChaincode.sh ClassContract:EnrollStudent MATH101 Alice

# Consulter le detail
./scripts/queryChaincode.sh ClassContract:GetClassDetails MATH101
```

---

## Depannage

**Ports deja utilises** :
```bash
lsof -i :7050    # orderer
lsof -i :7051    # peer school
lsof -i :9051    # peer students
docker stop $(docker ps -aq) && docker rm $(docker ps -aq)
```

**Nettoyer completement** :
```bash
cd network-new
./network.sh down
docker volume prune -f
docker network prune -f
```

**Logs des conteneurs** :
```bash
docker logs peer0.school.academic.edu
docker logs orderer.academic.edu
docker logs -f cli
```

**API ne repond pas** :
```bash
cd network-new/api
node server.js    # Redemarrer le serveur
```

---

## Demo de soutenance

### Scenario type

1. **Initialiser** : cliquer "Initialiser" cree 4 classes et inscrit 4 etudiants (Eve reste libre)
2. **Vue professeur** : selectionner une classe, ajouter un support, creer un examen, soumettre et publier une note
3. **Vue etudiant** : selectionner un etudiant inscrit, verifier qu'il voit ses supports, examens et notes publiees
4. **Inscription** : inscrire Eve dans une classe (montrer qu'elle ne peut aller que dans une seule)
5. **Isolation des notes** : montrer qu'un etudiant ne voit que ses propres notes publiees

### FAQ soutenance

**Pourquoi Hyperledger Fabric et pas Ethereum ?**
Fabric est une blockchain privee et permissionnee, adaptee au contexte academique : pas de gas fees, performances superieures, confidentialite par canal, controle des participants.

**Les donnees sont-elles vraiment immutables ?**
Oui. Une transaction validee ne peut pas etre modifiee. On peut seulement ajouter une nouvelle transaction corrective. L'historique complet reste visible.

**Comment gerer la scalabilite ?**
Fabric scale horizontalement (ajout de peers). L'API est stateless (load balancing possible). Pour une ecole, le debit actuel (~1000 TPS) est largement suffisant.

**Que se passe-t-il si un noeud tombe ?**
Les donnees sont repliquees sur les peers des deux organisations. Un peer peut rejoindre le reseau et se synchroniser automatiquement.

---

## Variables d'environnement

Fichier `network-new/api/.env` :
```
PORT=4000
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development
```

---

**Canal** : academic-channel | **Chaincode** : academic-cc | **Fabric** : 2.5.0
