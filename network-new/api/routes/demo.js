/*
 * Routes de demonstration
 *
 * Pas d'authentification ici : on passe directement par les scripts shell
 * pour invoquer le chaincode sur le reseau Fabric.
 * C'est plus simple pour la demo et ca evite de gerer les wallets/identites.
 */

'use strict';

const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const path = require('path');

// -- Protection contre l'injection shell --
// On vire tous les caracteres dangereux des entrees utilisateur
// avant de les passer aux commandes exec()
function sanitize(str) {
    if (typeof str !== 'string') return String(str);
    return str.replace(/[`$\\;|&><!()\[\]{}]/g, '');
}

// -- Execution d'un script chaincode --
// Lance queryChaincode.sh ou invokeChaincode.sh via docker exec
// et parse la sortie JSON du peer CLI
function runScript(type, contractFunction, args = []) {
    return new Promise((resolve, reject) => {
        const networkDir = path.join(__dirname, '../..');
        const script = type === 'query' ? 'queryChaincode.sh' : 'invokeChaincode.sh';
        const sanitizedArgs = args.map(a => sanitize(a));
        const argsStr = sanitizedArgs.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ');
        const cmd = `cd "${networkDir}" && ./scripts/${script} ${contractFunction} ${argsStr}`;

        console.log(`[demo] ${type}: ${contractFunction}(${sanitizedArgs.join(', ')})`);

        exec(cmd, { timeout: 60000 }, (error, stdout, stderr) => {
            if (error && !stdout) {
                reject(new Error(stderr || error.message));
                return;
            }

            // On cherche la premiere ligne JSON dans la sortie du peer
            // (le reste c'est des logs Fabric qu'on ignore)
            const lines = stdout.split('\n');
            let jsonLine = null;
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                    jsonLine = trimmed;
                    break;
                }
            }

            if (jsonLine) {
                try { resolve(JSON.parse(jsonLine)); }
                catch (e) { resolve(jsonLine); }
            } else if (stdout.includes('successful')) {
                resolve({ success: true, message: 'Transaction reussie' });
            } else {
                resolve({ success: true, output: stdout });
            }
        });
    });
}

// -- Classification des erreurs chaincode --
// On traduit les messages d'erreur du chaincode en codes HTTP
// pour que le frontend puisse afficher le bon message
function classifyError(error) {
    const msg = error.message || '';
    if (msg.includes('already exists') || msg.includes('already enrolled')) return { status: 409, error: msg };
    if (msg.includes('does not exist') || msg.includes('not found')) return { status: 404, error: msg };
    if (msg.includes('Access Denied') || msg.includes('Access denied')) return { status: 403, error: msg };
    if (msg.includes('Missing') || msg.includes('Invalid') || msg.includes('Expected')) return { status: 400, error: msg };
    return { status: 500, error: msg };
}

// -- Inscription sequentielle --
// Pour une meme classe, les inscriptions doivent etre sequentielles
// sinon Fabric rejette a cause du conflit de cle (meme state key modifie)
async function enrollSequential(classId, students) {
    const results = [];
    for (const s of students) {
        try {
            await runScript('invoke', 'ClassContract:EnrollStudent', [classId, s]);
            results.push({ student: s, ok: true });
        } catch (e) {
            results.push({ student: s, ok: false, error: e.message });
        }
    }
    return results;
}


// ==================== INITIALISATION ====================

// Cree les 4 classes de demo et inscrit un etudiant par classe
// Eve n'est pas inscrite pour que le prof puisse montrer l'inscription en live
router.post('/init', async (req, res) => {
    try {
        console.log('[init] Phase 1 : creation des 4 classes en parallele...');

        await Promise.allSettled([
            runScript('invoke', 'ClassContract:CreateClass',
                ['CYBER101', 'Cybersecurite', 'Securite informatique, cryptographie, analyse de vulnerabilites et pentest']),
            runScript('invoke', 'ClassContract:CreateClass',
                ['FIN201', 'Finance', 'Marches financiers, gestion de portefeuille et analyse financiere']),
            runScript('invoke', 'ClassContract:CreateClass',
                ['WEBDEV301', 'Developpement Web', 'Technologies web: HTML/CSS, JavaScript, React, Node.js, APIs REST']),
            runScript('invoke', 'ClassContract:CreateClass',
                ['DATA401', 'Data Science', 'Analyse de donnees, machine learning, Python et statistiques']),
        ]);

        console.log('[init] Phase 2 : inscription des etudiants (1 par classe)...');

        // Chaque etudiant appartient a une seule classe
        await Promise.allSettled([
            enrollSequential('CYBER101', ['Alice']),
            enrollSequential('FIN201', ['Bob']),
            enrollSequential('WEBDEV301', ['Charlie']),
            enrollSequential('DATA401', ['Diana']),
        ]);

        console.log('[init] Termine !');
        res.json({ success: true, message: 'Demo initialisee : 4 classes, 4 etudiants inscrits (Eve disponible)' });
    } catch (error) {
        console.error('[init] Erreur :', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// ==================== CLASSES ====================

// Liste toutes les classes (acces public)
router.get('/classes', async (req, res) => {
    try {
        const result = await runScript('query', 'ClassContract:GetAllClasses');
        res.json({ success: true, data: Array.isArray(result) ? result : [] });
    } catch (error) {
        const { status, error: msg } = classifyError(error);
        res.status(status).json({ success: false, error: msg });
    }
});

// Detail d'une classe (avec liste des etudiants inscrits)
router.get('/classes/:id', async (req, res) => {
    try {
        const id = sanitize(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'ID classe requis' });
        const result = await runScript('query', 'ClassContract:GetClassDetails', [id]);
        res.json({ success: true, data: result });
    } catch (error) {
        const { status, error: msg } = classifyError(error);
        res.status(status).json({ success: false, error: msg });
    }
});

// Creation d'une nouvelle classe (prof uniquement)
router.post('/classes', async (req, res) => {
    try {
        const { classId, name, description } = req.body;
        if (!classId || !name || !description) {
            return res.status(400).json({ success: false, error: 'Champs requis : classId, name, description' });
        }
        const result = await runScript('invoke', 'ClassContract:CreateClass', [classId, name, description]);
        res.status(201).json({ success: true, data: result, message: `Classe ${classId} creee` });
    } catch (error) {
        const { status, error: msg } = classifyError(error);
        res.status(status).json({ success: false, error: msg });
    }
});

// Inscription d'un etudiant dans une classe (prof uniquement)
router.post('/classes/:id/enroll', async (req, res) => {
    try {
        const classId = sanitize(req.params.id);
        const { studentId } = req.body;
        if (!studentId) return res.status(400).json({ success: false, error: 'Champ requis : studentId' });
        if (!classId) return res.status(400).json({ success: false, error: 'ID classe requis' });
        const result = await runScript('invoke', 'ClassContract:EnrollStudent', [classId, studentId]);
        res.json({ success: true, data: result, message: `${studentId} inscrit dans ${classId}` });
    } catch (error) {
        const { status, error: msg } = classifyError(error);
        res.status(status).json({ success: false, error: msg });
    }
});


// ==================== SUPPORTS DE COURS ====================

// Recupere les supports d'une classe (cours, TP, corrections)
router.get('/classes/:classId/materials', async (req, res) => {
    try {
        const classId = sanitize(req.params.classId);
        if (!classId) return res.status(400).json({ success: false, error: 'ID classe requis' });
        const result = await runScript('query', 'AcademicContract:GetClassMaterials', [classId]);
        res.json({ success: true, data: Array.isArray(result) ? result : [] });
    } catch (error) {
        const { status, error: msg } = classifyError(error);
        res.status(status).json({ success: false, error: msg });
    }
});

// Ajout d'un support de cours
// Le hash IPFS est genere cote serveur (en prod il viendrait du vrai upload IPFS)
router.post('/materials', async (req, res) => {
    try {
        const { materialId, classId, title, materialType } = req.body;
        if (!materialId || !classId || !title || !materialType) {
            return res.status(400).json({ success: false, error: 'Champs requis : materialId, classId, title, materialType' });
        }
        const ipfsHash = 'Qm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const result = await runScript('invoke', 'AcademicContract:UploadMaterial',
            [materialId, classId, title, materialType, ipfsHash, 'Professeur']);
        res.status(201).json({ success: true, data: result, message: `Support "${title}" ajoute` });
    } catch (error) {
        const { status, error: msg } = classifyError(error);
        res.status(status).json({ success: false, error: msg });
    }
});


// ==================== EXAMENS ====================

// Liste tous les examens
router.get('/exams', async (req, res) => {
    try {
        const result = await runScript('query', 'AcademicContract:GetAllExams');
        res.json({ success: true, data: Array.isArray(result) ? result : [] });
    } catch (error) {
        const { status, error: msg } = classifyError(error);
        res.status(status).json({ success: false, error: msg });
    }
});

// Planification d'un examen
router.post('/exams', async (req, res) => {
    try {
        const { examId, classId, title, examDate, description } = req.body;
        if (!examId || !classId || !title || !examDate) {
            return res.status(400).json({ success: false, error: 'Champs requis : examId, classId, title, examDate' });
        }
        const result = await runScript('invoke', 'AcademicContract:CreateExam',
            [examId, classId, title, examDate, description || '']);
        res.status(201).json({ success: true, data: result, message: `Examen "${title}" cree` });
    } catch (error) {
        const { status, error: msg } = classifyError(error);
        res.status(status).json({ success: false, error: msg });
    }
});


// ==================== NOTES ====================

// Recupere toutes les notes (acces prof uniquement via le chaincode)
router.get('/grades', async (req, res) => {
    try {
        const result = await runScript('query', 'AcademicContract:GetAllGrades');
        res.json({ success: true, data: Array.isArray(result) ? result : [] });
    } catch (error) {
        const { status, error: msg } = classifyError(error);
        res.status(status).json({ success: false, error: msg });
    }
});

// Soumission d'une note avec validation
router.post('/grades', async (req, res) => {
    try {
        const { gradeId, examId, studentId, score, maxScore, comments } = req.body;
        if (!gradeId || !examId || !studentId || score === undefined || maxScore === undefined) {
            return res.status(400).json({ success: false, error: 'Champs requis : gradeId, examId, studentId, score, maxScore' });
        }
        if (isNaN(Number(score)) || isNaN(Number(maxScore))) {
            return res.status(400).json({ success: false, error: 'score et maxScore doivent etre des nombres' });
        }
        if (Number(score) < 0 || Number(maxScore) <= 0) {
            return res.status(400).json({ success: false, error: 'score >= 0 et maxScore > 0' });
        }
        if (Number(score) > Number(maxScore)) {
            return res.status(400).json({ success: false, error: 'La note ne peut pas depasser le bareme' });
        }
        const result = await runScript('invoke', 'AcademicContract:SubmitGrade',
            [gradeId, examId, studentId, String(score), String(maxScore), comments || '']);
        res.status(201).json({ success: true, data: result, message: `Note ${gradeId} soumise` });
    } catch (error) {
        const { status, error: msg } = classifyError(error);
        res.status(status).json({ success: false, error: msg });
    }
});

// Publication d'une note (la rend visible pour l'etudiant)
router.post('/grades/:id/publish', async (req, res) => {
    try {
        const gradeId = sanitize(req.params.id);
        if (!gradeId) return res.status(400).json({ success: false, error: 'ID note requis' });
        const result = await runScript('invoke', 'AcademicContract:PublishGrade', [gradeId]);
        res.json({ success: true, data: result, message: `Note ${gradeId} publiee` });
    } catch (error) {
        const { status, error: msg } = classifyError(error);
        res.status(status).json({ success: false, error: msg });
    }
});

module.exports = router;
