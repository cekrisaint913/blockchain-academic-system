/*
 * Serveur API - Systeme Academique Blockchain
 *
 * Point d'entree de l'API REST qui fait le lien entre
 * l'interface web et le reseau Hyperledger Fabric.
 *
 * On utilise deux modes :
 *   - Mode demo : les routes passent par des scripts shell (pas besoin du SDK Fabric)
 *   - Mode SDK  : si le SDK Fabric est installe, on charge aussi les routes avancees
 *
 * Canal : academic-channel
 * Chaincode : academic-cc
 */

'use strict';

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const dotenv = require('dotenv');

// Variables d'environnement (.env a la racine de l'api)
dotenv.config();

const app = express();


// ==================== MIDDLEWARE ====================

// Autorise les requetes cross-origin depuis le frontend
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
}));

// Parse du corps des requetes (JSON + formulaires)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logs des requetes HTTP en console (format dev = concis et colore)
app.use(morgan('dev'));


// ==================== ROUTES ====================

// Verification rapide que le serveur tourne
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'API Academique Blockchain en ligne',
        timestamp: new Date().toISOString()
    });
});

// -- Routes de demo --
// Elles utilisent des scripts shell pour parler au chaincode
// C'est le mode principal pour la soutenance
const demoRoutes = require('./routes/demo');
app.use('/api', demoRoutes);

// -- Routes SDK Fabric (optionnelles) --
// Ces routes necessitent fabric-network et ipfs-http-client
// Si les modules ne sont pas installes, on les ignore sans planter
try {
    const { generateToken } = require('./middleware/auth');
    const fabricService = require('./services/fabricService');
    const classesRoutes = require('./routes/classes');
    const materialsRoutes = require('./routes/materials');

    // Authentification via le wallet Fabric
    app.post('/api/auth/login', async (req, res) => {
        try {
            const { userId, orgMSP, role } = req.body;
            if (!userId || !orgMSP || !role) {
                return res.status(400).json({ success: false, error: 'Champs requis : userId, orgMSP, role' });
            }
            const exists = await fabricService.identityExists(userId);
            if (!exists) {
                return res.status(404).json({ success: false, error: `Identite "${userId}" introuvable dans le wallet.` });
            }
            const token = generateToken(userId, orgMSP, role);
            res.json({ success: true, data: { token, userId, orgMSP, role } });
        } catch (error) {
            console.error('[auth] Erreur login :', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Liste les identites disponibles dans le wallet
    app.get('/api/auth/identities', async (req, res) => {
        try {
            const identities = await fabricService.listIdentities();
            res.json({ success: true, count: identities.length, data: identities });
        } catch (error) {
            console.error('[auth] Erreur identites :', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Routes avancees via le SDK (prefixees /api/sdk/)
    app.use('/api/sdk/classes', classesRoutes);
    app.use('/api/sdk/materials', materialsRoutes);

    console.log('Routes SDK Fabric chargees (auth, classes, materials)');
} catch (err) {
    console.warn(`Routes SDK non chargees : ${err.message}`);
    console.warn('   Les routes demo (/api/classes, /api/exams, /api/grades) restent disponibles');
}

// Interface web statique (le dashboard HTML)
app.use(express.static(path.join(__dirname, 'public')));


// ==================== GESTION D'ERREURS ====================

// Route inexistante
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: `Route ${req.method} ${req.path} introuvable`
    });
});

// Erreur non geree (filet de securite)
app.use((err, req, res, next) => {
    console.error('Erreur non geree :', err);
    res.status(500).json({
        success: false,
        error: err.message || 'Erreur interne du serveur'
    });
});


// ==================== DEMARRAGE ====================

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log('   Systeme Academique Blockchain - API');
    console.log('========================================');
    console.log('');
    console.log(`Serveur demarre sur http://localhost:${PORT}`);
    console.log(`Health check : http://localhost:${PORT}/health`);
    console.log(`Environnement : ${process.env.NODE_ENV || 'development'}`);
    console.log('');
    console.log('Routes disponibles (mode demo) :');
    console.log('   POST   /api/init');
    console.log('   GET    /api/classes');
    console.log('   GET    /api/classes/:id');
    console.log('   POST   /api/classes');
    console.log('   POST   /api/classes/:id/enroll');
    console.log('   GET    /api/classes/:classId/materials');
    console.log('   POST   /api/materials');
    console.log('   GET    /api/exams');
    console.log('   POST   /api/exams');
    console.log('   GET    /api/grades');
    console.log('   POST   /api/grades');
    console.log('   POST   /api/grades/:id/publish');
    console.log('');
    console.log('Reseau Fabric :');
    console.log('   Canal : academic-channel');
    console.log('   Chaincode : academic-cc');
    console.log('');
});

module.exports = app;
