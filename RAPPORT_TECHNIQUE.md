# Rapport Technique
# Systeme Academique Blockchain -- Processus d'ingenierie

Hyperledger Fabric 2.5 | Node.js | Express | Tailwind CSS
Fevrier 2026

---

## 1. Problematique et choix techniques

### Le probleme de depart

On part d'un constat simple : dans un systeme academique classique, les notes vivent dans une base de donnees centrale. Un admin peut les modifier, les perdre, ou les falsifier sans que personne ne s'en rende compte. On veut rendre ca impossible.

La blockchain regle ce probleme : chaque note devient une transaction signee et horodatee, inscrite dans un registre qu'on ne peut pas modifier apres coup. Meme l'admin ne peut pas tricher.

### Pourquoi Fabric et pas Ethereum ?

On a vite ecarte Ethereum. Dans un contexte academique, on n'a pas besoin d'une blockchain publique ouverte a tout le monde. On veut au contraire controler qui participe au reseau. Fabric est fait pour ca : c'est une blockchain privee ou seuls les membres autorises peuvent lire et ecrire.

En plus, pas de gas fees (les transactions sont gratuites), le chaincode s'ecrit en Node.js (pas besoin d'apprendre Solidity), et les performances sont largement suffisantes pour un etablissement (~1000 TPS).

### Les 4 contraintes du cahier des charges

Le cahier des charges impose quatre regles qu'on doit respecter a la lettre :

1. **Classes publiques** -- tout le monde peut voir la liste des classes et leur description
2. **Supports reserves aux inscrits** -- seuls les etudiants inscrits dans une classe ont acces aux cours et TP
3. **Corrections 24h apres** -- les corrections d'examen ne sont accessibles que 24 heures apres la date de l'epreuve
4. **Notes privees** -- un etudiant ne voit que ses propres notes, et seulement une fois que le prof les a publiees

A ca s'ajoutent quelques regles supplementaires : un etudiant ne peut etre inscrit que dans une seule classe, seul le prof inscrit les etudiants, les notes sont sur 20.

---

## 2. Architecture et decisions de conception

### Vue d'ensemble

```
 Dashboard HTML  ──▶  API Express  ──▶  Hyperledger Fabric
 (Tailwind CSS)       (Node.js)         (Chaincode Node.js)
                          │
                    Scripts shell
                  (docker exec peer)
```

Trois couches, separees proprement : le frontend envoie des requetes HTTP a l'API, l'API parle au chaincode Fabric via des scripts shell, et le chaincode lit/ecrit dans le registre distribue.

### Le choix du pont shell (et pourquoi on n'a pas utilise le SDK)

C'est probablement la decision de conception la plus importante du projet. Fabric fournit un SDK Node.js (`fabric-network`) pour parler au chaincode depuis une application. Mais ce SDK demande de gerer des wallets, des identites, des profils de connexion, et surtout il a des dependances lourdes qui posent des problemes de compatibilite (on a eu des soucis avec `ipfs-http-client` et `ERR_PACKAGE_PATH_NOT_EXPORTED`).

On a donc opte pour une approche plus directe : l'API lance des scripts shell qui executent `peer chaincode query/invoke` dans le conteneur CLI Docker. C'est moins elegant, mais ca marche tout le temps, c'est facile a debugger (on peut tester le chaincode directement en ligne de commande), et ca enleve toute la complexite du SDK.

Le SDK reste disponible en option -- les routes `/api/sdk/*` sont chargees dans un `try/catch`, donc si les modules sont installes ca marche, sinon l'API tourne quand meme.

### Arborescence du projet

```
network-new/
├── network.sh                    # Script de gestion du reseau
├── configtx.yaml                 # Organisations + canal
├── crypto-config.yaml            # Topologie des certificats
├── docker-compose-network.yaml   # Peers, orderer, CLI
├── scripts/                      # Scripts d'interaction chaincode
├── chaincode/academic-cc/        # Smart contracts (5 contrats Node.js)
│   ├── index.js                  # Point d'entree + AcademicContract
│   └── lib/                      # ClassContract, MaterialContract, ExamContract, GradeContract
└── api/                          # Serveur Express + dashboard HTML
```

---

## 3. Le reseau Fabric

### Topologie

On a monte un reseau avec deux organisations et un orderer :

- **SchoolOrg** (SchoolMSP) -- `peer0.school.academic.edu:7051` -- les profs et l'admin
- **StudentsOrg** (StudentsMSP) -- `peer0.students.academic.edu:9051` -- les etudiants
- **Orderer** -- `orderer.academic.edu:7050` -- ordonnancement des blocs (mode Solo)
- **CLI** -- conteneur d'administration pour executer les commandes chaincode

Le tout tourne dans Docker, connecte par le reseau `academic-network`. Un seul canal (`academic-channel`) regroupe les deux organisations.

### Certificats et TLS

Les certificats sont generes par `cryptogen`. Chaque organisation a son propre MSP (Membership Service Provider) avec sa hierarchie de certificats. Le TLS est active partout -- toutes les communications entre peers, orderer et CLI sont chiffrees.

### Consensus Solo : un compromis assume

On utilise le consensus Solo (un seul orderer). C'est un point de defaillance unique, mais c'est largement suffisant pour une demo. En production on passerait a Raft avec 3 ou 5 orderers, mais ca ajoutait de la complexite sans apporter de valeur pour la soutenance.

---

## 4. Les smart contracts

### Architecture multi-contrat

Le chaincode est decoupe en cinq contrats. Au debut, on avait tout dans un seul fichier (`index.js`), mais ca devenait vite illisible. On a refactorise en contrats separes, chacun avec sa responsabilite :

| Contrat | Fichier | Role |
|---------|---------|------|
| AcademicContract | `index.js` | Contrat principal (init, materials, exams, grades) |
| ClassContract | `lib/class.js` | Classes et inscriptions |
| MaterialContract | `lib/material.js` | Supports de cours |
| ExamContract | `lib/exam.js` | Examens et corrections |
| GradeContract | `lib/grade.js` | Notes (avec requetes CouchDB) |

L'appel se fait au format `ContractName:FunctionName` (ex: `ClassContract:CreateClass`). Les routes de demo utilisent le contrat principal avec son prefixe implicite `AcademicContract`.

### Controle d'acces par MSP

Chaque fonction verifie le MSP de l'appelant via `ctx.clientIdentity.getMSPID()`. Ca donne une matrice de droits assez claire :

- **SchoolMSP** : acces total (creation, lecture, ecriture)
- **StudentsMSP** : lecture conditionnelle (inscrits seulement), inscription de soi-meme
- **Public** : uniquement la liste des classes (contrainte 1)

Par exemple, `GetClassMaterials` appelle `_checkEnrollment()` qui verifie que l'etudiant figure dans la liste `enrolledStudents` de la classe. Si c'est un prof (SchoolMSP), on laisse passer directement.

### Le probleme du non-determinisme

On a decouvert un bug subtil en testant : les transactions etaient rejetees de maniere aleatoire. Le probleme venait de `new Date()` dans le chaincode. Chaque peer execute le chaincode independamment, et si les horodatages ne sont pas identiques, Fabric considere que les resultats divergent et rejette la transaction.

La solution : utiliser l'horodatage de la transaction (`ctx.stub.getTxTimestamp()`) au lieu de `new Date()`. Cet horodatage est fixe dans la proposition de transaction, donc il est identique sur tous les peers.

```javascript
_getTxTimestamp(ctx) {
    const timestamp = ctx.stub.getTxTimestamp();
    const seconds = timestamp.seconds.low || timestamp.seconds;
    return new Date(seconds * 1000).toISOString();
}
```

### Implementation des 4 contraintes dans le chaincode

**Contrainte 1 (classes publiques)** : `GetAllClasses` ne fait aucun controle d'acces et retourne uniquement id, nom, description -- la liste des inscrits est exclue.

**Contrainte 2 (supports reserves)** : `_checkEnrollment()` verifie l'inscription. Si l'etudiant n'est pas dans `enrolledStudents`, erreur.

**Contrainte 3 (corrections 24h)** : `GetCorrectionFile` calcule `examDate + 24h` et refuse l'acces si le delai n'est pas ecoule. Les profs n'ont pas cette restriction.

**Contrainte 4 (notes privees)** : les notes sont creees avec `isPublished: false`. Le prof doit appeler `PublishGrade` pour passer a `true`. Cote etudiant, seules les notes publiees avec son `studentId` sont visibles.

---

## 5. L'API REST

### Le pont shell

Le coeur de l'API, c'est la fonction `runScript()` dans `routes/demo.js`. Elle prend un type (query ou invoke), un nom de fonction chaincode, et des arguments. Elle construit la commande shell, l'execute via `child_process.exec()`, et parse la sortie JSON du peer CLI.

Un point technique : la sortie du peer melange des logs Fabric avec le resultat JSON. On parcourt les lignes de sortie jusqu'a trouver la premiere qui commence par `[` ou `{` -- c'est le JSON qu'on veut.

### Sanitization des entrees

Vu qu'on passe des entrees utilisateur a des commandes shell, on a du se proteger contre l'injection de commandes. La fonction `sanitize()` vire tous les caracteres dangereux (backticks, dollar, point-virgule, pipe, etc.) avant de construire la commande.

### Routes

12 routes en tout, toutes accessibles sans authentification (mode demo) :

| Route | Description |
|-------|-------------|
| `POST /api/init` | Cree 4 classes + inscrit 4 etudiants |
| `GET /api/classes` | Liste des classes |
| `GET /api/classes/:id` | Detail avec inscrits |
| `POST /api/classes` | Creer une classe |
| `POST /api/classes/:id/enroll` | Inscrire un etudiant |
| `GET /api/classes/:id/materials` | Supports de cours |
| `POST /api/materials` | Ajouter un support |
| `GET/POST /api/exams` | Lister / creer des examens |
| `GET/POST /api/grades` | Lister / soumettre des notes |
| `POST /api/grades/:id/publish` | Publier une note |

Les erreurs du chaincode sont traduites en codes HTTP : 409 (conflit), 404 (introuvable), 403 (interdit), 400 (invalide), 500 (erreur interne).

### L'initialisation de demo

La route `/api/init` cree un jeu de donnees pour la soutenance : 4 classes (Cybersecurite, Finance, Dev Web, Data Science) avec 1 etudiant chacune. Eve n'est pas inscrite -- ca permet de montrer l'inscription en live.

Un point technique : les inscriptions d'une meme classe sont faites sequentiellement. Si on les fait en parallele, Fabric rejette car deux transactions essaient de modifier la meme cle (l'objet classe avec sa liste d'inscrits). On a perdu pas mal de temps a comprendre ca.

---

## 6. Le frontend

### Un seul fichier HTML

On a fait le choix d'un fichier HTML unique (`public/index.html`) avec du JavaScript vanilla et Tailwind CSS en CDN. Pas de React, pas de build, pas de bundler. Ce choix etait delibere : un seul fichier a deployer, zero configuration, et c'est suffisant pour la demo.

### Deux vues, deux roles

Au lancement, l'utilisateur choisit son role (professeur ou etudiant). Ce choix simule l'authentification MSP -- en production, le role serait determine automatiquement par le certificat X.509.

**Vue professeur** : on selectionne une classe, puis 4 onglets -- Organisation (inscrits + inscription), Supports (ajout de cours/TP), Examens (planification), Notes (saisie + publication).

**Vue etudiant** : on selectionne un etudiant, puis une grille de classes. Si l'etudiant est inscrit, il voit supports, examens et notes publiees. Sinon, message "cadenas".

### Problemes resolus cote frontend

**Visibilite des notes** : on a eu un bug ou toutes les notes etaient visibles par tous les etudiants. Le probleme venait du fait que le filtrage `studentId === sStudent && isPublished === true` n'etait pas applique correctement -- la variable `sStudent` n'etait pas mise a jour au bon moment. Corrige en forcant la lecture de la valeur du select a chaque rendu.

**Inscription unique** : la regle "un etudiant = une classe" est verifiee cote frontend par `getStudentClass()` qui parcourt les details de chaque classe pour trouver si l'etudiant est deja inscrit quelque part. Le menu d'inscription n'affiche que les etudiants non encore affectes.

**Actualisation** : un timer de 15 secondes recharge automatiquement les donnees. On a aussi un bouton "Actualiser" pour forcer le rechargement. Ca permet de voir en temps reel les changements faits depuis une autre vue (ex: le prof publie une note, l'etudiant la voit apparaitre).

---

## 7. Securite

La securite est repartie sur plusieurs couches :

**Reseau** : TLS active sur tous les composants (orderer, peers). Toutes les communications sont chiffrees.

**Identites** : certificats X.509 generes par cryptogen. Chaque participant a un certificat qui l'identifie dans son organisation.

**Chaincode** : controle d'acces par MSP. Chaque fonction verifie qui appelle avant de faire quoi que ce soit.

**API** : sanitization des entrees contre l'injection shell. Les caracteres ``$;|&><()[]{}`` sont supprimes des arguments avant de les passer aux commandes `exec()`.

**Frontend** : echappement HTML contre le XSS. Toute donnee affichee dynamiquement passe par `esc()` qui utilise `textContent` pour neutraliser les balises.

**Blockchain** : immutabilite du registre. Une transaction validee ne peut pas etre modifiee. On peut seulement ajouter une nouvelle transaction corrective, mais l'historique complet reste visible.

---

## 8. Modeles de donnees

Quatre entites dans le registre, identifiees par un champ `docType` :

**Classe** : `{ docType: "class", id: "CYBER101", name, description, enrolledStudents: [], createdAt, updatedAt }`

**Support** : `{ docType: "material", materialId: "MAT-CYBER101-12345", classId, title, materialType: "COURS"|"TP"|"CORRECTION", ipfsHash }`

**Examen** : `{ docType: "exam", examId: "EX-CYBER101-1", classId, title, examDate, description }`

**Note** : `{ docType: "grade", gradeId: "GR-EX-CYBER101-1-Alice", examId, studentId, score, maxScore: 20, isPublished: false }`

Le champ `isPublished` est le mecanisme central de la contrainte 4 : a la creation la note est invisible, elle ne devient visible qu'apres publication explicite par le prof.

---

## 9. Deploiement

Trois commandes suffisent pour lancer le tout :

```bash
cd network-new
./network.sh all      # genere les certificats, demarre Docker, cree le canal, deploie le chaincode
cd api && npm install && node server.js   # demarre l'API sur http://localhost:4000
```

Le script `network.sh` orchestre tout : generation des certificats (`cryptogen`), creation des artefacts du canal (`configtxgen`), demarrage des conteneurs Docker, creation du canal, et deploiement du chaincode sur les deux peers.

Apres deploiement, on a 6 conteneurs Docker : orderer, 2 peers, CLI, et 2 conteneurs de chaincode (un par peer, crees automatiquement par Fabric).

---

## 10. Tests et validation

### Verification des contraintes

On a teste chaque contrainte du cahier des charges :

1. `GET /api/classes` sans auth → liste des classes retournee (contrainte 1 OK)
2. Etudiant non inscrit essaie d'acceder aux supports → erreur "not enrolled" (contrainte 2 OK)
3. Examen avec date passee → correction disponible si > 24h, sinon compte a rebours (contrainte 3 OK)
4. Note soumise non publiee → invisible pour l'etudiant. Apres publication → visible uniquement pour l'etudiant concerne (contrainte 4 OK)

### Scenario de soutenance

1. Cliquer "Initialiser" → 4 classes, 4 etudiants inscrits, Eve libre
2. Vue prof → selectionner CYBER101, ajouter un support, creer un examen, noter Alice
3. Vue etudiant → selectionner Alice, verifier qu'elle voit ses supports et sa note
4. Inscrire Eve → montrer qu'elle ne peut aller que dans une seule classe
5. Selectionner Bob → montrer qu'il ne voit pas les notes d'Alice

---

## 11. Limites et perspectives

### Ce qu'on n'a pas fait (et pourquoi)

**Authentification reelle** : le choix du role est fait cote frontend, pas par certificat. On a fait ce compromis pour simplifier la demo -- gerer les wallets Fabric, les identites, les tokens JWT, ca rajoutait beaucoup de complexite pour peu de valeur en soutenance.

**IPFS** : les supports de cours ont un hash IPFS fictif. Le stockage IPFS etait prevu mais `ipfs-http-client` posait des problemes de compatibilite avec les imports ESM. On a prefere se concentrer sur le chaincode.

**CouchDB** : les contrats avances (`lib/grade.js`) utilisent des requetes CouchDB (rich queries) avec un fallback sur LevelDB. On n'a pas deploye CouchDB car ca rajoutait 2 conteneurs Docker et de la configuration pour un gain limite en demo.

**Consensus** : Solo au lieu de Raft. Un seul orderer, donc un point de defaillance unique. Acceptable pour une demo, pas pour la production.

### Evolutions possibles

- Passer au SDK Fabric avec wallet et authentification par certificat
- Deployer IPFS pour le vrai stockage de fichiers
- Migrer le frontend vers React pour une meilleure maintenabilite
- Ajouter des notifications temps reel via les evenements chaincode (WebSocket)
- Passer a Raft pour un consensus tolerant aux pannes

---

## 12. Conclusion

On a livre un systeme fonctionnel qui respecte les 4 contraintes du cahier des charges. Les notes sont immutables, les acces sont controles par MSP, et chaque operation est tracee dans le registre.

Le choix du pont shell plutot que le SDK Fabric a ete le bon compromis : ca nous a permis d'avancer vite, d'avoir un systeme stable, et de garder la possibilite de tester le chaincode directement en ligne de commande.

Les limites sont connues et assumees (pas d'auth reelle, pas d'IPFS, consensus Solo). Ce sont des choix de scope, pas des defauts de conception -- l'architecture est pensee pour accueillir ces evolutions sans tout casser.
