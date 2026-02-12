# Rapport Technique

## Systeme de Gestion Academique Decentralise sur Blockchain

**Technologie** : Hyperledger Fabric 2.5
**Date** : Fevrier 2026

---

## Table des matieres

1. [Introduction](#1-introduction)
2. [Contexte et problematique](#2-contexte-et-problematique)
3. [Cahier des charges](#3-cahier-des-charges)
4. [Architecture generale](#4-architecture-generale)
5. [Reseau Hyperledger Fabric](#5-reseau-hyperledger-fabric)
6. [Smart contracts (chaincode)](#6-smart-contracts-chaincode)
7. [API REST](#7-api-rest)
8. [Interface utilisateur](#8-interface-utilisateur)
9. [Securite](#9-securite)
10. [Modeles de donnees](#10-modeles-de-donnees)
11. [Flux applicatifs](#11-flux-applicatifs)
12. [Deploiement](#12-deploiement)
13. [Tests et validation](#13-tests-et-validation)
14. [Limites et perspectives](#14-limites-et-perspectives)
15. [Conclusion](#15-conclusion)
16. [Annexes](#16-annexes)

---

## 1. Introduction

Ce rapport presente la conception et la realisation d'un systeme de gestion academique decentralise. Le systeme repose sur la blockchain Hyperledger Fabric pour garantir l'immutabilite, la tracabilite et la transparence des donnees academiques : classes, inscriptions, supports de cours, examens et notes.

Le choix d'une blockchain privee et permissionnee repond a un besoin precis : assurer que les donnees sensibles (notes, inscriptions) ne puissent etre modifiees apres coup, tout en controlant finement qui peut lire et ecrire chaque type de donnee.

Le systeme est compose de trois couches :
- Un **reseau Fabric** avec deux organisations (etablissement et etudiants)
- Une **API REST** (Node.js/Express) qui fait le pont entre l'interface web et le chaincode
- Un **dashboard web** (HTML/Tailwind CSS) avec deux vues distinctes : professeur et etudiant

---

## 2. Contexte et problematique

### 2.1 Problemes des systemes academiques classiques

Les systemes de gestion academique traditionnels (bases de donnees centralisees) presentent plusieurs faiblesses :

| Probleme | Impact |
|----------|--------|
| Notes modifiables apres coup | Risque de fraude, litiges etudiant/professeur |
| Fraude sur les diplomes | Falsification de releves de notes |
| Perte de donnees | Un serveur central tombe, les donnees sont perdues |
| Manque de transparence | L'etudiant n'a pas de visibilite sur l'historique de ses notes |
| Confiance centralisee | Tout repose sur un administrateur unique |

### 2.2 Apport de la blockchain

La blockchain repond a chacun de ces problemes :

- **Immutabilite** : chaque note est une transaction validee par consensus. Une fois inscrite dans un bloc, elle ne peut plus etre modifiee.
- **Verification cryptographique** : chaque transaction est signee par un certificat X.509. On peut verifier a tout moment qui a soumis une note et quand.
- **Replication** : les donnees sont repliquees sur les peers des deux organisations. La perte d'un noeud n'entraine pas de perte de donnees.
- **Historique complet** : l'etudiant peut consulter l'historique de toutes les operations liees a ses notes.
- **Consensus distribue** : aucune entite unique ne controle le systeme. Les transactions sont validees par les peers des deux organisations.

### 2.3 Pourquoi Hyperledger Fabric et pas Ethereum

Fabric est une blockchain **privee et permissionnee**, ce qui la rend adaptee au contexte academique :

- **Pas de gas fees** : contrairement a Ethereum, les transactions ne coutent rien
- **Performances** : Fabric peut traiter environ 1000 transactions par seconde, largement suffisant pour un etablissement
- **Confidentialite par canal** : on peut creer des canaux prives pour isoler les donnees
- **Controle des participants** : seuls les membres authentifies (SchoolMSP, StudentsMSP) peuvent interagir avec le reseau
- **Chaincode en Node.js** : pas besoin d'apprendre Solidity, le chaincode s'ecrit en JavaScript

---

## 3. Cahier des charges

### 3.1 Les 4 contraintes obligatoires

Le projet doit respecter quatre regles de gestion imposees par le cahier des charges :

**Contrainte 1 : Classes accessibles a tous**
> La description et l'organisation de chaque classe sont visibles publiquement.

Implementation : la fonction `GetAllClasses` du chaincode ne fait aucun controle d'acces. La route API `GET /api/classes` est accessible sans authentification. Les informations retournees sont limitees aux champs publics (id, nom, description) ; la liste des inscrits est exclue de la vue publique.

**Contrainte 2 : Supports visibles par les inscrits**
> Les supports de cours et TP sont accessibles uniquement aux etudiants inscrits dans la classe.

Implementation : la fonction `_checkEnrollment()` presente dans chaque contrat (MaterialContract, ExamContract) verifie que l'etudiant appelant figure dans la liste `enrolledStudents` de la classe. Si ce n'est pas le cas, l'acces est refuse avec une erreur explicite.

**Contrainte 3 : Examens et corrections disponibles 24h apres**
> Les examens et leurs corrections sont accessibles 24 heures apres la date de l'examen.

Implementation : dans ExamContract, la fonction `GetCorrectionFile` calcule `correctionAvailableAt = examDate + 24h`. Si l'appelant est un etudiant et que le delai n'est pas ecoule, l'acces est refuse. Les professeurs n'ont pas cette restriction. Le frontend affiche un compte a rebours pour informer l'etudiant.

**Contrainte 4 : Notes visibles uniquement par l'etudiant concerne**
> Chaque etudiant n'a acces qu'a ses propres notes, et seulement apres publication par le professeur.

Implementation : les notes ont un champ `isPublished` (booleen). A la soumission (`SubmitGrade`), la note est creee avec `isPublished: false`. Le professeur la rend visible via `PublishGrade`. Cote etudiant, le frontend filtre les notes par `studentId === sStudent && isPublished === true`. Au niveau chaincode, la fonction `_canAccessGrade()` verifie que l'etudiant ne peut voir que ses propres notes.

### 3.2 Regles supplementaires

- **Un etudiant = une seule classe** : verification cote frontend (`getStudentClass()`) et coherence metier
- **Seul le professeur inscrit** : controle d'acces MSP dans `EnrollStudent` (SchoolMSP requis pour inscrire un autre etudiant)
- **Trois types de supports** : Cours, TP, Correction
- **Notes sur 20 points** : validation `score >= 0`, `maxScore > 0`, `score <= maxScore`

---

## 4. Architecture generale

### 4.1 Vue d'ensemble

```
┌──────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Dashboard HTML  │────▶│  API Express     │────▶│  Hyperledger Fabric │
│  (Tailwind CSS)  │     │  (Node.js)       │     │  (Chaincode Node.js)│
└──────────────────┘     └────────┬─────────┘     └─────────────────────┘
   Navigateur web                 │                   Peers + Orderer
                                  │                   dans Docker
                            Scripts shell
                          (docker exec peer)
```

Le flux est le suivant :
1. L'utilisateur interagit avec le dashboard web (HTML statique servi par Express)
2. Le dashboard envoie des requetes HTTP a l'API REST (`localhost:4000`)
3. L'API execute un script shell (`queryChaincode.sh` ou `invokeChaincode.sh`)
4. Le script lance `peer chaincode query/invoke` dans le conteneur CLI Docker
5. Le peer communique avec le chaincode qui lit/ecrit dans le registre distribue
6. La reponse JSON remonte par le meme chemin

### 4.2 Choix du mode shell

L'API communique avec le chaincode via des scripts shell plutot que via le SDK Fabric (`fabric-network`). Ce choix a ete fait pour plusieurs raisons :

- **Simplicite** : pas besoin de gerer les wallets, les identites et la connexion Gateway
- **Fiabilite** : le CLI Fabric est l'outil officiel, il fonctionne toujours
- **Demo-friendly** : pour la soutenance, on peut tester le chaincode directement en ligne de commande
- **Pas de dependance externe** : pas de `fabric-network` ni `ipfs-http-client` a installer

Le SDK Fabric reste disponible en option (routes `/api/sdk/*`) mais est charge dans un bloc `try/catch` : si les modules ne sont pas installes, l'API fonctionne quand meme en mode demo.

### 4.3 Structure du projet

```
blockchain-academic-system/
├── README.md                              # Documentation unifiee
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
    │   ├── lib/class.js                   # ClassContract
    │   ├── lib/material.js                # MaterialContract
    │   ├── lib/exam.js                    # ExamContract
    │   └── lib/grade.js                   # GradeContract
    │
    ├── api/                               # Serveur API REST
    │   ├── server.js                      # Point d'entree Express (port 4000)
    │   ├── routes/demo.js                 # Routes de demo (via scripts shell)
    │   └── public/index.html              # Dashboard web (interface unique)
    │
    ├── crypto-config/                     # Configuration pour cryptogen
    ├── channel-artifacts/                 # Artefacts du canal (genesis, tx)
    └── organizations/                     # Certificats et MSP generes
```

---

## 5. Reseau Hyperledger Fabric

### 5.1 Topologie

Le reseau est compose des elements suivants :

| Composant | Conteneur Docker | Port | Role |
|-----------|-----------------|------|------|
| Orderer | `orderer.academic.edu` | 7050 | Ordonnancement des transactions (Solo) |
| Peer School | `peer0.school.academic.edu` | 7051 | Peer de l'organisation SchoolOrg |
| Peer Students | `peer0.students.academic.edu` | 9051 | Peer de l'organisation StudentsOrg |
| CLI | `cli` | - | Conteneur d'administration (exec chaincode) |

Le reseau Docker `academic-network` connecte tous les conteneurs entre eux.

### 5.2 Organisations et MSP

Le reseau comporte deux organisations :

| Organisation | MSP ID | Domaine | Role | Droits |
|-------------|--------|---------|------|--------|
| SchoolOrg | `SchoolMSP` | school.academic.edu | Professeurs, administration | Lecture + ecriture complete |
| StudentsOrg | `StudentsMSP` | students.academic.edu | Etudiants | Lecture + inscription limitee |

Chaque organisation possede :
- Un **peer** qui maintient une copie du registre
- Un **MSP** (Membership Service Provider) qui gere les certificats
- Des **certificats TLS** pour la communication securisee

### 5.3 Canal

Un seul canal est utilise : `academic-channel`. Il regroupe les deux organisations. Toutes les donnees (classes, inscriptions, supports, examens, notes) transitent par ce canal.

### 5.4 Consensus

Le mode de consensus est **Solo** (un seul orderer). Ce choix est adapte au contexte de demonstration. En production, on utiliserait **Raft** (consensus tolerant aux pannes) avec plusieurs orderers.

### 5.5 Certificats

Les certificats sont generes par `cryptogen` a partir du fichier `crypto-config.yaml`. La hierarchie est la suivante :

```
organizations/
├── ordererOrganizations/
│   └── academic.edu/
│       ├── msp/           # MSP de l'orderer
│       └── orderers/
│           └── orderer.academic.edu/
│               ├── msp/   # Certificats du noeud
│               └── tls/   # Certificats TLS
├── peerOrganizations/
│   ├── school.academic.edu/
│   │   ├── msp/           # MSP de SchoolOrg
│   │   └── peers/
│   │       └── peer0.school.academic.edu/
│   │           ├── msp/
│   │           └── tls/
│   └── students.academic.edu/
│       ├── msp/           # MSP de StudentsMSP
│       └── peers/
│           └── peer0.students.academic.edu/
│               ├── msp/
│               └── tls/
```

Le TLS est active sur tous les composants (orderer, peers). Les communications sont chiffrees.

### 5.6 Configuration du canal (`configtx.yaml`)

Le fichier `configtx.yaml` definit :

- **Les organisations** avec leurs politiques de lecture, ecriture et administration
- **Les capacites** du canal (V2_0), de l'orderer (V2_0) et des applications (V2_5)
- **Le profil Orderer** (`AcademicOrdererGenesis`) avec le consortium `AcademicConsortium`
- **Le profil Canal** (`AcademicChannel`) qui regroupe SchoolOrg et StudentsOrg

Les politiques d'endossement exigent une **majorite** (`MAJORITY Endorsement`) pour la validation des transactions de cycle de vie du chaincode, ce qui signifie que les deux organisations doivent approuver le deploiement.

---

## 6. Smart contracts (chaincode)

### 6.1 Architecture multi-contrat

Le chaincode `academic-cc` est ecrit en **Node.js** avec la librairie `fabric-contract-api`. Il est compose de cinq contrats, chacun dans un fichier separe :

| Contrat | Fichier | Responsabilite |
|---------|---------|---------------|
| `AcademicContract` | `index.js` | Contrat principal : fonctions generiques (init, materials, exams, grades) |
| `ClassContract` | `lib/class.js` | Gestion des classes et des inscriptions |
| `MaterialContract` | `lib/material.js` | Gestion des supports de cours (avec IPFS) |
| `ExamContract` | `lib/exam.js` | Gestion des examens et des corrections |
| `GradeContract` | `lib/grade.js` | Gestion des notes (avec CouchDB queries) |

L'appel au chaincode se fait au format `ContractName:FunctionName`. Par exemple, `ClassContract:CreateClass` appelle la fonction `CreateClass` du contrat `ClassContract`.

Les routes de demo de l'API utilisent le contrat principal `AcademicContract` (prefixe implicite).

### 6.2 Prefixes de cles d'etat

Chaque entite dans le registre est identifiee par une cle prefixee :

| Prefixe | Entite | Exemple |
|---------|--------|---------|
| (ID direct) | Classe | `CYBER101` |
| (ID direct) | Inscription | (stockee dans l'objet classe) |
| `MAT-` | Support de cours | `MAT-CYBER101-12345` |
| `EX-` | Examen | `EX-CYBER101-1` |
| `GR-` | Note | `GR-EX-CYBER101-1-Alice` |

### 6.3 Controle d'acces

Chaque contrat implemente des fonctions de controle d'acces basees sur le MSP de l'appelant :

```javascript
_isSchoolMember(ctx) {
    return ctx.clientIdentity.getMSPID() === 'SchoolMSP';
}

_isStudentMember(ctx) {
    return ctx.clientIdentity.getMSPID() === 'StudentsMSP';
}
```

La matrice des droits d'acces est la suivante :

| Fonction | SchoolMSP | StudentsMSP | Public |
|----------|-----------|-------------|--------|
| CreateClass | Oui | Non | Non |
| GetAllClasses | Oui | Oui | Oui |
| GetClassDetails | Oui | Oui | Non |
| EnrollStudent | Oui | Lui-meme | Non |
| UploadMaterial | Oui | Non | Non |
| GetClassMaterials | Oui | Si inscrit | Non |
| CreateExam | Oui | Non | Non |
| GetExams | Oui | Si inscrit | Non |
| GetCorrectionFile | Oui | Si inscrit + 24h | Non |
| SubmitGrade | Oui | Non | Non |
| PublishGrade | Oui | Non | Non |
| GetGrade | Oui | Ses notes | Non |

### 6.4 Horodatage deterministe

Un probleme technique important en blockchain est le **non-determinisme**. Si chaque peer genere son propre horodatage avec `new Date()`, les valeurs seront differentes entre les peers, ce qui cause un rejet de la transaction lors de la validation.

La solution adoptee est d'utiliser l'horodatage de la transaction fourni par Fabric :

```javascript
_getTxTimestamp(ctx) {
    const timestamp = ctx.stub.getTxTimestamp();
    const seconds = timestamp.seconds.low || timestamp.seconds;
    return new Date(seconds * 1000).toISOString();
}
```

Cet horodatage est le meme sur tous les peers car il est inclus dans la proposition de transaction.

### 6.5 Evenements chaincode

Chaque operation importante emet un evenement Fabric (`ctx.stub.setEvent()`). Ces evenements permettent a des applications clientes de reagir en temps reel aux changements :

- `ClassCreated` : creation d'une classe
- `StudentEnrolled` : inscription d'un etudiant
- `MaterialUploaded` : ajout d'un support
- `ExamCreated` : creation d'un examen
- `CorrectionUploaded` : ajout d'une correction
- `GradeSubmitted` : soumission d'une note
- `GradePublished` : publication d'une note

### 6.6 Fonctions detaillees

#### ClassContract

**`CreateClass(ctx, classId, name, description)`** -- Submit
- Verifie que l'appelant est SchoolMSP
- Verifie que la classe n'existe pas deja
- Cree un objet avec `docType: 'class'`, `enrolledStudents: []`, timestamp deterministe
- Emet l'evenement `ClassCreated`

**`GetAllClasses(ctx)`** -- Evaluate
- Aucun controle d'acces (public)
- Parcourt tous les etats du registre via `getStateByRange('', '')`
- Filtre par `docType === 'class'`
- Retourne uniquement id, name, description (pas les inscrits)

**`GetClassDetails(ctx, classId)`** -- Evaluate
- Requiert une authentification (SchoolMSP ou StudentsMSP)
- Retourne l'objet complet avec la liste des inscrits

**`EnrollStudent(ctx, classId, studentId)`** -- Submit
- Si SchoolMSP : peut inscrire n'importe quel etudiant
- Si StudentsMSP : peut uniquement s'inscrire lui-meme
- Verifie que l'etudiant n'est pas deja inscrit dans cette classe
- Ajoute le studentId a la liste `enrolledStudents`

#### AcademicContract (contrat principal)

**`SubmitGrade(ctx, gradeId, examId, studentId, score, maxScore, comments)`** -- Submit
- Verifie que l'appelant est SchoolMSP
- Verifie que l'examen existe
- Cree la note avec `isPublished: false`
- L'etudiant ne peut pas encore voir cette note

**`PublishGrade(ctx, gradeId)`** -- Submit
- Verifie que l'appelant est SchoolMSP
- Passe `isPublished` de `false` a `true`
- Ajoute un timestamp de publication
- A partir de ce moment, l'etudiant concerne peut voir sa note

**`GetAllGrades(ctx)`** -- Evaluate
- Reserve a SchoolMSP
- Retourne toutes les notes (publiees et non publiees)

**`GetStudentGrades(ctx, studentId)`** -- Evaluate
- Un etudiant ne peut voir que ses propres notes
- Les notes non publiees sont filtrees pour les etudiants

---

## 7. API REST

### 7.1 Serveur Express

Le serveur API est un fichier `server.js` qui configure Express avec :

- **CORS** : autorise les requetes cross-origin depuis le frontend
- **Morgan** : logs des requetes HTTP en console
- **JSON parser** : parse le corps des requetes
- **Fichiers statiques** : sert le dashboard HTML depuis `public/`

Le serveur ecoute sur le port 4000 (configurable via variable d'environnement `PORT`).

### 7.2 Pont shell vers le chaincode

La fonction centrale de l'API est `runScript()` dans `routes/demo.js` :

```javascript
function runScript(type, contractFunction, args = []) {
    const script = type === 'query' ? 'queryChaincode.sh' : 'invokeChaincode.sh';
    const cmd = `cd "${networkDir}" && ./scripts/${script} ${contractFunction} ${argsStr}`;
    exec(cmd, { timeout: 60000 }, (error, stdout, stderr) => {
        // Parse la sortie JSON du peer CLI
    });
}
```

Cette fonction :
1. Determine le script a utiliser (query pour les lectures, invoke pour les ecritures)
2. Sanitize les arguments utilisateur
3. Execute le script via `child_process.exec()`
4. Parse la premiere ligne JSON de la sortie (le reste etant des logs Fabric)
5. Retourne la reponse parsee

### 7.3 Routes API

Toutes les routes de demo sont accessibles sans authentification :

| Methode | Route | Chaincode appele | Description |
|---------|-------|-----------------|-------------|
| POST | `/api/init` | Multiples | Initialise 4 classes + 4 etudiants |
| GET | `/api/classes` | `ClassContract:GetAllClasses` | Liste des classes |
| GET | `/api/classes/:id` | `ClassContract:GetClassDetails` | Detail avec inscrits |
| POST | `/api/classes` | `ClassContract:CreateClass` | Creer une classe |
| POST | `/api/classes/:id/enroll` | `ClassContract:EnrollStudent` | Inscrire un etudiant |
| GET | `/api/classes/:id/materials` | `AcademicContract:GetClassMaterials` | Supports de cours |
| POST | `/api/materials` | `AcademicContract:UploadMaterial` | Ajouter un support |
| GET | `/api/exams` | `AcademicContract:GetAllExams` | Liste des examens |
| POST | `/api/exams` | `AcademicContract:CreateExam` | Planifier un examen |
| GET | `/api/grades` | `AcademicContract:GetAllGrades` | Toutes les notes |
| POST | `/api/grades` | `AcademicContract:SubmitGrade` | Soumettre une note |
| POST | `/api/grades/:id/publish` | `AcademicContract:PublishGrade` | Publier une note |
| GET | `/health` | - | Verification serveur |

### 7.4 Classification des erreurs

L'API traduit les messages d'erreur du chaincode en codes HTTP :

```javascript
function classifyError(error) {
    const msg = error.message || '';
    if (msg.includes('already exists'))   return { status: 409 };  // Conflit
    if (msg.includes('does not exist'))   return { status: 404 };  // Non trouve
    if (msg.includes('Access Denied'))    return { status: 403 };  // Interdit
    if (msg.includes('Missing'))          return { status: 400 };  // Requete invalide
    return { status: 500 };                                        // Erreur interne
}
```

### 7.5 Format des reponses

Toutes les reponses suivent un format JSON uniforme :

```json
{ "success": true,  "data": { ... } }
{ "success": false, "error": "Message d'erreur" }
```

### 7.6 Route d'initialisation

La route `POST /api/init` cree un jeu de donnees de demonstration :

**Phase 1** : Creation de 4 classes en parallele
- `CYBER101` -- Cybersecurite
- `FIN201` -- Finance
- `WEBDEV301` -- Developpement Web
- `DATA401` -- Data Science

**Phase 2** : Inscription sequentielle de 4 etudiants (1 par classe)
- Alice dans CYBER101
- Bob dans FIN201
- Charlie dans WEBDEV301
- Diana dans DATA401

Eve n'est pas inscrite pour que le professeur puisse montrer l'inscription en direct pendant la soutenance.

Les inscriptions d'une meme classe sont faites sequentiellement (`enrollSequential()`) car Fabric rejette les transactions concurrentes qui modifient la meme cle d'etat.

---

## 8. Interface utilisateur

### 8.1 Architecture frontend

Le frontend est un **fichier HTML unique** (`public/index.html`) qui combine :
- **HTML** : structure de la page
- **Tailwind CSS** (via CDN) : mise en page responsive
- **JavaScript vanilla** : logique applicative dans un bloc `<script>`

Ce choix de fichier unique simplifie le deploiement (pas de build, pas de serveur frontend separe) et facilite la demonstration.

### 8.2 Ecran de selection du role

Au lancement, l'utilisateur choisit son role :
- **Professeur** : acces complet (gestion des classes, supports, examens, notes)
- **Etudiant** : acces en lecture (consultation des supports, examens, notes publiees)

Ce choix simule l'authentification MSP du reseau Fabric. En production, le role serait determine par le certificat X.509 de l'utilisateur.

### 8.3 Vue Professeur

L'espace professeur est organise en onglets apres selection d'une classe :

**Onglet Organisation**
- Affiche le nom, la description et l'identifiant de la classe
- Liste des etudiants inscrits (badges)
- Formulaire d'inscription : menu deroulant des etudiants disponibles (non encore affectes a une classe)

**Onglet Supports**
- Formulaire d'ajout : titre + type (Cours, TP, Correction)
- Liste des supports avec icones differenciees par type

**Onglet Examens**
- Formulaire de planification : titre + date
- Liste des examens avec mini-calendrier et badge "Passe"/"A venir"

**Onglet Notes**
- Formulaire de saisie : examen + etudiant + note/20 + commentaire
- Case a cocher "Publier immediatement" (cochee par defaut)
- Tableau des notes avec code couleur :
  - Vert : >= 14/20 (70%)
  - Orange : >= 10/20 (50%)
  - Rouge : < 10/20
- Bouton "Publier" pour les notes non encore publiees

### 8.4 Vue Etudiant

L'espace etudiant commence par la selection d'un etudiant (Alice, Bob, Charlie, Diana, Eve) puis affiche :

**Grille des classes**
- Carte par classe avec indication "Ma classe" ou "Non inscrit"
- Bandeau d'information en haut : inscrit dans quelle classe ou "Non inscrit"

**Detail d'une classe** (apres clic)
- Si non inscrit : message "cadenas" avec instruction de contacter le professeur
- Si inscrit, trois onglets :
  - **Supports** : liste des cours, TP et corrections
  - **Examens** : avec indication de disponibilite de la correction (compte a rebours 24h)
  - **Mes Notes** : uniquement les notes publiees, avec code couleur

### 8.5 Actualisation des donnees

Le dashboard implemente deux mecanismes d'actualisation :

- **Automatique** : toutes les 15 secondes, la fonction `loadAll()` recharge classes, examens et notes depuis l'API
- **Manuelle** : bouton "Actualiser" qui force un rechargement immediat

### 8.6 Notifications

Un systeme de **toast** (notification temporaire en haut a droite) informe l'utilisateur du resultat de chaque action :
- Vert : operation reussie
- Rouge : erreur

### 8.7 Logs blockchain

Un panneau depliable "Logs Blockchain" en bas de page affiche en temps reel les requetes envoyees a l'API et leurs reponses, avec code couleur (bleu: info, vert: succes, rouge: erreur).

---

## 9. Securite

### 9.1 Couches de securite

Le systeme implemente la securite a plusieurs niveaux :

| Couche | Mecanisme | Implementation |
|--------|-----------|---------------|
| Reseau | TLS mutuel | Certificats X.509 generes par cryptogen |
| Identites | PKI Fabric | SchoolMSP et StudentsMSP |
| Chaincode | Controle d'acces MSP | `ctx.clientIdentity.getMSPID()` |
| API (demo) | Sanitization shell | Fonction `sanitize()` |
| API (SDK) | JWT + RBAC | `jsonwebtoken` + middleware `auth.js` |
| Frontend | Echappement HTML | Fonction `esc()` (prevention XSS) |
| Blockchain | Immutabilite | Consensus distribue |

### 9.2 Protection contre l'injection shell

L'API passe les entrees utilisateur a des commandes `exec()`. Pour prevenir l'injection de commandes, une fonction `sanitize()` retire tous les caracteres dangereux :

```javascript
function sanitize(str) {
    if (typeof str !== 'string') return String(str);
    return str.replace(/[`$\\;|&><!()\[\]{}]/g, '');
}
```

Les caracteres supprimes incluent : backticks, dollar, backslash, point-virgule, pipe, ampersand, chevrons, parentheses, crochets et accolades. Cela empeche l'injection de commandes shell arbitraires.

De plus, les arguments sont encadres par des guillemets doubles avec echappement des guillemets internes.

### 9.3 Prevention XSS

Le frontend utilise une fonction d'echappement HTML pour toute donnee affichee dynamiquement :

```javascript
function esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
}
```

Cette technique utilise l'API DOM du navigateur pour echapper automatiquement les caracteres HTML (`<`, `>`, `&`, `"`, `'`).

### 9.4 TLS

Le TLS est active sur tous les composants du reseau Fabric :
- L'orderer utilise `ORDERER_GENERAL_TLS_ENABLED=true`
- Les peers utilisent `CORE_PEER_TLS_ENABLED=true`
- Les scripts chaincode passent l'option `--tls` avec le certificat CA

---

## 10. Modeles de donnees

### 10.1 Classe

```json
{
    "docType": "class",
    "id": "CYBER101",
    "name": "Cybersecurite",
    "description": "Securite informatique, cryptographie, pentest",
    "modules": [],
    "enrolledStudents": ["Alice", "Bob"],
    "createdBy": "Admin@school.academic.edu",
    "createdAt": "2026-02-10T14:00:00.000Z",
    "updatedAt": "2026-02-10T14:05:00.000Z"
}
```

### 10.2 Support de cours

```json
{
    "docType": "material",
    "materialId": "MAT-CYBER101-12345",
    "classId": "CYBER101",
    "title": "Introduction a la cryptographie",
    "materialType": "COURS",
    "ipfsHash": "QmABC123...",
    "uploadedBy": "Professeur",
    "uploadedAt": "2026-02-10T14:30:00.000Z"
}
```

### 10.3 Examen

```json
{
    "docType": "exam",
    "examId": "EX-CYBER101-1",
    "classId": "CYBER101",
    "title": "Partiel Cryptographie",
    "examDate": "2026-03-01",
    "description": "Examen de mi-semestre",
    "createdAt": "2026-02-10T15:00:00.000Z"
}
```

### 10.4 Note

```json
{
    "docType": "grade",
    "gradeId": "GR-EX-CYBER101-1-Alice",
    "examId": "EX-CYBER101-1",
    "studentId": "Alice",
    "score": 16,
    "maxScore": 20,
    "comments": "Bon travail",
    "isPublished": false,
    "submittedAt": "2026-02-10T15:30:00.000Z"
}
```

Apres publication :

```json
{
    "isPublished": true,
    "publishedAt": "2026-02-10T16:00:00.000Z"
}
```

---

## 11. Flux applicatifs

### 11.1 Flux d'inscription d'un etudiant

```
Professeur                    API                   Chaincode
    │                          │                       │
    │  POST /api/classes/      │                       │
    │  CYBER101/enroll         │                       │
    │  { studentId: "Eve" }    │                       │
    │─────────────────────────▶│                       │
    │                          │  invokeChaincode.sh   │
    │                          │  ClassContract:       │
    │                          │  EnrollStudent         │
    │                          │  CYBER101 Eve         │
    │                          │──────────────────────▶│
    │                          │                       │ Verifie MSP
    │                          │                       │ Verifie classe existe
    │                          │                       │ Verifie pas deja inscrit
    │                          │                       │ Ajoute a enrolledStudents
    │                          │                       │ Emet StudentEnrolled
    │                          │     { success: true } │
    │                          │◀──────────────────────│
    │   201 Created            │                       │
    │◀─────────────────────────│                       │
```

### 11.2 Flux de soumission et publication d'une note

```
Professeur                    API                   Chaincode
    │                          │                       │
    │  POST /api/grades        │                       │
    │  { gradeId, examId,      │                       │
    │    studentId, score...}  │                       │
    │─────────────────────────▶│                       │
    │                          │  SubmitGrade           │
    │                          │──────────────────────▶│
    │                          │                       │ Cree note
    │                          │                       │ isPublished = false
    │                          │     201 Created       │
    │◀─────────────────────────│◀──────────────────────│
    │                          │                       │
    │  POST /api/grades/       │                       │
    │  GR-.../publish          │                       │
    │─────────────────────────▶│                       │
    │                          │  PublishGrade          │
    │                          │──────────────────────▶│
    │                          │                       │ isPublished = true
    │                          │                       │ Emet GradePublished
    │                          │     200 OK            │
    │◀─────────────────────────│◀──────────────────────│
```

A ce moment, l'etudiant concerne peut voir sa note.

### 11.3 Flux de consultation etudiant

```
Etudiant (Alice)              API                   Chaincode
    │                          │                       │
    │  GET /api/grades         │                       │
    │─────────────────────────▶│                       │
    │                          │  GetAllGrades          │
    │                          │──────────────────────▶│
    │                          │                       │ Retourne toutes les notes
    │                          │◀──────────────────────│
    │                          │                       │
    │  Filtrage cote frontend: │                       │
    │  studentId === 'Alice'   │                       │
    │  && isPublished === true │                       │
    │                          │                       │
    │   Notes publiees d'Alice │                       │
    │◀─────────────────────────│                       │
```

Note : dans le mode demo, le filtrage par etudiant est fait cote frontend. Dans le mode SDK avec authentification, le chaincode `GetStudentGrades` fait ce filtrage cote serveur en verifiant l'identite de l'appelant.

---

## 12. Deploiement

### 12.1 Prerequis

- Docker et Docker Compose
- Hyperledger Fabric 2.5 binaires (`cryptogen`, `configtxgen`, `peer`)
- Node.js 16+

### 12.2 Etapes de deploiement

```bash
# 1. Installer les binaires Fabric
curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh --fabric-version 2.5.0 binary
export PATH=$PATH:$(pwd)/bin

# 2. Deployer le reseau complet
cd network-new
./network.sh all    # generate + up + createChannel + deployCC

# 3. Demarrer l'API
cd api
npm install
node server.js      # http://localhost:4000
```

### 12.3 Script `network.sh`

Le script `network.sh` orchestre toutes les operations du reseau :

| Commande | Action |
|----------|--------|
| `./network.sh generate` | Genere les certificats et les artefacts du canal |
| `./network.sh up` | Demarre les conteneurs Docker |
| `./network.sh createChannel` | Cree le canal `academic-channel` |
| `./network.sh deployCC` | Installe et approuve le chaincode sur les deux organisations |
| `./network.sh all` | Execute les 4 etapes ci-dessus |
| `./network.sh down` | Arrete les conteneurs et supprime les volumes |

### 12.4 Conteneurs Docker

Apres deploiement, les conteneurs suivants sont actifs :

```
CONTAINER ID   IMAGE                             NAMES
...            hyperledger/fabric-orderer:latest  orderer.academic.edu
...            hyperledger/fabric-peer:latest     peer0.school.academic.edu
...            hyperledger/fabric-peer:latest     peer0.students.academic.edu
...            hyperledger/fabric-tools:latest    cli
...            hyperledger/fabric-nodeenv:latest  dev-peer0.school-academic-cc-2.0
...            hyperledger/fabric-nodeenv:latest  dev-peer0.students-academic-cc-2.0
```

Les deux derniers conteneurs (`dev-peer0.*`) sont les conteneurs de chaincode crees automatiquement par Fabric lors du deploiement. Ils executent le code Node.js du chaincode.

---

## 13. Tests et validation

### 13.1 Tests en ligne de commande

Le chaincode peut etre teste directement via les scripts shell :

```bash
# Lister les classes
./scripts/queryChaincode.sh ClassContract:GetAllClasses

# Creer une classe
./scripts/invokeChaincode.sh ClassContract:CreateClass MATH101 Maths "Algebre"

# Inscrire un etudiant
./scripts/invokeChaincode.sh ClassContract:EnrollStudent MATH101 Alice

# Consulter le detail
./scripts/queryChaincode.sh ClassContract:GetClassDetails MATH101
```

### 13.2 Tests via l'API

```bash
# Health check
curl http://localhost:4000/health

# Initialiser la demo
curl -X POST http://localhost:4000/api/init

# Lister les classes
curl http://localhost:4000/api/classes

# Creer un examen
curl -X POST http://localhost:4000/api/exams \
  -H "Content-Type: application/json" \
  -d '{"examId":"EX-CYBER101-1","classId":"CYBER101","title":"Partiel","examDate":"2026-03-01"}'

# Soumettre une note
curl -X POST http://localhost:4000/api/grades \
  -H "Content-Type: application/json" \
  -d '{"gradeId":"GR-EX-CYBER101-1-Alice","examId":"EX-CYBER101-1","studentId":"Alice","score":16,"maxScore":20}'

# Publier la note
curl -X POST http://localhost:4000/api/grades/GR-EX-CYBER101-1-Alice/publish
```

### 13.3 Scenario de validation fonctionnelle

Le scenario suivant permet de verifier le respect des 4 contraintes :

1. **Contrainte 1** : Acceder a `GET /api/classes` sans authentification → la liste des classes est retournee
2. **Contrainte 2** : En tant qu'etudiant non inscrit, tenter d'acceder aux supports → message "Non inscrit"
3. **Contrainte 3** : Creer un examen avec une date passee, verifier que la correction est disponible apres 24h
4. **Contrainte 4** : Soumettre une note sans la publier → invisible pour l'etudiant. La publier → visible uniquement pour l'etudiant concerne

### 13.4 Scenario de demonstration

Pour la soutenance, le scenario type est :

1. **Initialiser** : cliquer "Initialiser" cree 4 classes et inscrit 4 etudiants (Eve reste libre)
2. **Vue professeur** : selectionner CYBER101, ajouter un support, creer un examen, soumettre et publier la note d'Alice
3. **Vue etudiant** : selectionner Alice, verifier qu'elle voit ses supports, examens et notes publiees
4. **Inscription** : inscrire Eve dans une classe (montrer qu'elle ne peut aller que dans une seule)
5. **Isolation des notes** : selectionner Bob, montrer qu'il ne voit pas les notes d'Alice

---

## 14. Limites et perspectives

### 14.1 Limites actuelles

**Mode demo simplifie**
Le mode demo ne fait pas d'authentification reelle. Le choix du role (professeur/etudiant) est fait cote frontend, sans verification cote serveur. En production, chaque utilisateur serait authentifie par son certificat X.509 via le wallet Fabric.

**Consensus Solo**
Le consensus Solo utilise un seul orderer, ce qui est un point de defaillance unique. En production, on utiliserait Raft avec 3 ou 5 orderers.

**Pas de stockage IPFS reel**
Les supports de cours generent un hash IPFS fictif. En production, les fichiers seraient reellement uploades sur un noeud IPFS et le hash CID serait stocke dans le chaincode.

**Base de donnees d'etat LevelDB**
Les peers utilisent LevelDB (par defaut). Les contrats avances (`lib/grade.js`) tentent des requetes CouchDB (rich queries) avec un fallback sur `getStateByRange`. En production, CouchDB serait configure pour beneficier des requetes JSON.

**Un seul canal**
Toutes les donnees passent par un seul canal. En production, on pourrait creer des canaux prives (par exemple un canal par departement) pour une meilleure isolation des donnees.

### 14.2 Perspectives d'evolution

- **Authentification complete** : integration du wallet Fabric avec le SDK `fabric-network` pour une authentification par certificat
- **IPFS reel** : deploiement d'un noeud IPFS pour le stockage des supports de cours (PDF, presentations)
- **Interface React** : migration du dashboard HTML vers une application React avec composants reutilisables
- **Notifications temps reel** : utilisation des evenements chaincode via WebSocket pour notifier les etudiants de la publication d'une note
- **Multi-canal** : creation de canaux prives par departement pour isoler les donnees
- **Consensus Raft** : passage a un consensus tolerant aux pannes avec plusieurs orderers
- **Application mobile** : application mobile pour la consultation des notes et des supports

---

## 15. Conclusion

Ce projet demontre la faisabilite d'un systeme de gestion academique decentralise sur blockchain. Les quatre contraintes du cahier des charges sont respectees :

1. Les classes sont accessibles publiquement
2. Les supports sont reserves aux inscrits
3. Les corrections sont disponibles 24h apres l'examen
4. Les notes ne sont visibles que par l'etudiant concerne, apres publication

L'utilisation d'Hyperledger Fabric apporte des garanties que les systemes centralises ne peuvent offrir :
- **Immutabilite** : une note validee ne peut pas etre modifiee retroactivement
- **Tracabilite** : chaque operation est horodatee et signee
- **Transparence** : l'historique complet est accessible
- **Resilience** : la replication sur plusieurs noeuds protege contre la perte de donnees

L'architecture en trois couches (chaincode, API, frontend) separe clairement les responsabilites et permet d'evoluer chaque composant independamment. Le mode demo via scripts shell facilite la demonstration tout en preservant la possibilite de passer au SDK Fabric pour une utilisation en production.

---

## 16. Annexes

### Annexe A : Technologies utilisees

| Technologie | Version | Utilisation |
|-------------|---------|-------------|
| Hyperledger Fabric | 2.5.0 | Blockchain privee permissionnee |
| Node.js | 18+ | Runtime backend et chaincode |
| Express | 4.18 | Framework API REST |
| fabric-contract-api | 2.x | Framework de smart contracts |
| Docker | 24+ | Conteneurisation des composants Fabric |
| Docker Compose | 2.x | Orchestration des conteneurs |
| Tailwind CSS | 3.x (CDN) | Framework CSS pour le dashboard |
| cryptogen | 2.5.0 | Generation des certificats PKI |
| configtxgen | 2.5.0 | Generation des artefacts du canal |

### Annexe B : Ports reseau

| Port | Service | Protocole |
|------|---------|-----------|
| 4000 | API Express | HTTP |
| 7050 | Orderer | gRPC + TLS |
| 7051 | Peer School | gRPC + TLS |
| 9051 | Peer Students | gRPC + TLS |
| 9443 | Orderer Operations | HTTP |
| 9444 | Peer School Operations | HTTP |
| 9445 | Peer Students Operations | HTTP |

### Annexe C : Variables d'environnement

| Variable | Valeur par defaut | Description |
|----------|-------------------|-------------|
| `PORT` | `4000` | Port de l'API Express |
| `CORS_ORIGIN` | `http://localhost:3000` | Origine CORS autorisee |
| `NODE_ENV` | `development` | Environnement d'execution |

### Annexe D : Commandes de depannage

```bash
# Verifier les conteneurs
docker ps -a

# Logs d'un peer
docker logs peer0.school.academic.edu

# Logs de l'orderer
docker logs orderer.academic.edu

# Nettoyer completement
cd network-new
./network.sh down
docker volume prune -f
docker network prune -f

# Verifier les ports
lsof -i :7050
lsof -i :7051
lsof -i :9051
```
