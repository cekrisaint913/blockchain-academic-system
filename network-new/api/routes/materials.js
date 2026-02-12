/*
 * Routes - Materials (Supports de Cours)
 *
 * Endpoints pour la gestion des supports via MaterialContract
 * Intégration IPFS pour stockage off-chain des fichiers volumineux
 */

'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const fabricService = require('../services/fabricService');
const ipfsService = require('../services/ipfsService');
const { authenticate, authorize } = require('../middleware/auth');

// Configuration Multer pour upload fichiers
const storage = multer.memoryStorage(); // Stockage en mémoire pour envoi direct à IPFS

const fileFilter = (req, file, cb) => {
    // Types de fichiers autorisés
    const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'image/png',
        'image/jpeg',
        'application/zip',
        'text/plain'
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Type de fichier non autorisé: ${file.mimetype}`), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50 MB max
    }
});

/**
 * GET /api/classes/:classId/materials
 * Lister tous les supports d'une classe
 *
 * Requiert authentification
 * Vérifie automatiquement l'enrollment via le chaincode
 *
 * Retourne: Liste des supports (sans ipfsHash pour sécurité)
 */
router.get('/classes/:classId/materials', authenticate, async (req, res) => {
    try {
        const { classId } = req.params;
        const { userId, orgMSP } = req.user;

        console.log(`📥 GET /api/classes/${classId}/materials by ${userId}`);

        // Le chaincode vérifie automatiquement l'enrollment
        const result = await fabricService.evaluateTransaction(
            userId,
            orgMSP,
            'MaterialContract',
            'GetCourseMaterials',
            classId
        );

        res.json({
            success: true,
            count: result.length,
            data: result
        });

    } catch (error) {
        console.error('Error fetching materials:', error);

        if (error.message.includes('does not exist')) {
            return res.status(404).json({
                success: false,
                error: `Class ${req.params.classId} not found`
            });
        }

        if (error.message.includes('Access denied') || error.message.includes('must be enrolled')) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. You must be enrolled in this class to view materials.'
            });
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/materials/:materialId/file
 * Obtenir le hash IPFS d'un support pour téléchargement
 *
 * Requiert authentification
 * Vérifie enrollment avant de retourner le hash
 *
 * Retourne: { ipfsHash, title, ... }
 */
router.get('/:materialId/file', authenticate, async (req, res) => {
    try {
        const { materialId } = req.params;
        const { userId, orgMSP } = req.user;

        console.log(`📥 GET /api/materials/${materialId}/file by ${userId}`);

        // Le chaincode vérifie automatiquement l'enrollment
        const result = await fabricService.evaluateTransaction(
            userId,
            orgMSP,
            'MaterialContract',
            'GetMaterialFile',
            materialId
        );

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error fetching material file:', error);

        if (error.message.includes('does not exist')) {
            return res.status(404).json({
                success: false,
                error: `Material ${req.params.materialId} not found`
            });
        }

        if (error.message.includes('Access denied') || error.message.includes('must be enrolled')) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. You must be enrolled in this class to access materials.'
            });
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/materials
 * Upload un nouveau support de cours
 *
 * Requiert authentification + rôle teacher
 *
 * Body: {
 *   materialId,
 *   classId,
 *   moduleId,
 *   title,
 *   type,      // "COURS" ou "TP"
 *   ipfsHash   // Hash IPFS du fichier uploadé
 * }
 */
router.post('/', authenticate, authorize(['teacher']), async (req, res) => {
    try {
        const { materialId, classId, moduleId, title, type, ipfsHash } = req.body;
        const { userId, orgMSP } = req.user;

        // Validation
        if (!materialId || !classId || !moduleId || !title || !type || !ipfsHash) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: materialId, classId, moduleId, title, type, ipfsHash'
            });
        }

        // Valider le type
        if (type !== 'COURS' && type !== 'TP') {
            return res.status(400).json({
                success: false,
                error: 'Invalid type. Must be "COURS" or "TP"'
            });
        }

        console.log(`📤 POST /api/materials - Uploading material ${materialId} by ${userId}`);

        const result = await fabricService.submitTransaction(
            userId,
            orgMSP,
            'MaterialContract',
            'UploadCourseMaterial',
            materialId,
            classId,
            moduleId,
            title,
            type,
            ipfsHash
        );

        res.status(201).json({
            success: true,
            data: {
                materialId: result,
                message: `Material ${materialId} uploaded successfully`
            }
        });

    } catch (error) {
        console.error('Error uploading material:', error);

        if (error.message.includes('Access Denied')) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Only teachers can upload materials.'
            });
        }

        if (error.message.includes('does not exist')) {
            return res.status(404).json({
                success: false,
                error: `Class ${req.body.classId} not found`
            });
        }

        if (error.message.includes('already exists')) {
            return res.status(409).json({
                success: false,
                error: `Material ${req.body.materialId} already exists`
            });
        }

        if (error.message.includes('Invalid type')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid type. Must be "COURS" or "TP"'
            });
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/materials/:materialId
 * Supprimer un support de cours
 *
 * Requiert authentification + rôle teacher
 */
router.delete('/:materialId', authenticate, authorize(['teacher']), async (req, res) => {
    try {
        const { materialId } = req.params;
        const { userId, orgMSP } = req.user;

        console.log(`📤 DELETE /api/materials/${materialId} by ${userId}`);

        const result = await fabricService.submitTransaction(
            userId,
            orgMSP,
            'MaterialContract',
            'DeleteMaterial',
            materialId
        );

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error deleting material:', error);

        if (error.message.includes('does not exist')) {
            return res.status(404).json({
                success: false,
                error: `Material ${req.params.materialId} not found`
            });
        }

        if (error.message.includes('Access Denied')) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Only teachers can delete materials.'
            });
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/materials/:materialId
 * Obtenir les détails d'un support (teachers only)
 *
 * Requiert authentification + rôle teacher
 */
router.get('/:materialId', authenticate, authorize(['teacher']), async (req, res) => {
    try {
        const { materialId } = req.params;
        const { userId, orgMSP } = req.user;

        console.log(`📥 GET /api/materials/${materialId} by ${userId}`);

        const result = await fabricService.evaluateTransaction(
            userId,
            orgMSP,
            'MaterialContract',
            'GetMaterial',
            materialId
        );

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error fetching material:', error);

        if (error.message.includes('does not exist')) {
            return res.status(404).json({
                success: false,
                error: `Material ${req.params.materialId} not found`
            });
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// IPFS Integration Routes - Upload & Download
// ============================================================================

/**
 * POST /api/materials/upload
 * Upload un fichier sur IPFS et enregistre le hash on-chain
 *
 * Requiert authentification + rôle teacher
 *
 * Form-data:
 *   - file: Fichier à uploader (PDF, DOC, PPT, etc.)
 *   - classId: ID de la classe
 *   - moduleId: ID du module
 *   - title: Titre du support
 *   - type: "COURS" ou "TP"
 *
 * Retourne: { ipfsHash, materialId, ... }
 */
router.post('/upload', authenticate, authorize(['teacher']), upload.single('file'), async (req, res) => {
    try {
        const { classId, moduleId, title, type } = req.body;
        const { userId, orgMSP } = req.user;

        // Validation des champs requis
        if (!classId || !moduleId || !title || !type) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: classId, moduleId, title, type'
            });
        }

        // Validation du fichier
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded. Please provide a file.'
            });
        }

        // Valider le type
        if (type !== 'COURS' && type !== 'TP') {
            return res.status(400).json({
                success: false,
                error: 'Invalid type. Must be "COURS" or "TP"'
            });
        }

        console.log(`📤 POST /api/materials/upload - Uploading ${req.file.originalname} by ${userId}`);
        console.log(`   Class: ${classId}, Module: ${moduleId}, Type: ${type}`);
        console.log(`   File size: ${req.file.size} bytes, MIME: ${req.file.mimetype}`);

        // 1. Upload sur IPFS
        const ipfsResult = await ipfsService.uploadFile(
            req.file.buffer,
            req.file.originalname
        );

        console.log(`   IPFS upload complete: ${ipfsResult.cid}`);

        // 2. Générer un ID unique pour le material
        const materialId = `MAT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // 3. Enregistrer le hash on-chain via le chaincode
        const result = await fabricService.submitTransaction(
            userId,
            orgMSP,
            'MaterialContract',
            'UploadCourseMaterial',
            materialId,
            classId,
            moduleId,
            title,
            type,
            ipfsResult.cid
        );

        console.log(`   On-chain registration complete: ${materialId}`);

        res.status(201).json({
            success: true,
            data: {
                materialId,
                ipfsHash: ipfsResult.cid,
                ipfsSize: ipfsResult.size,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                mimeType: req.file.mimetype,
                classId,
                moduleId,
                title,
                type,
                message: 'Material uploaded successfully to IPFS and registered on blockchain'
            }
        });

    } catch (error) {
        console.error('Error uploading material:', error);

        if (error.message.includes('IPFS')) {
            return res.status(503).json({
                success: false,
                error: `IPFS service error: ${error.message}`
            });
        }

        if (error.message.includes('Access Denied')) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Only teachers can upload materials.'
            });
        }

        if (error.message.includes('does not exist')) {
            return res.status(404).json({
                success: false,
                error: `Class ${req.body.classId} not found`
            });
        }

        if (error.message.includes('already exists')) {
            return res.status(409).json({
                success: false,
                error: 'Material already exists'
            });
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/materials/:materialId/download
 * Télécharge un fichier depuis IPFS
 *
 * Requiert authentification
 * Vérifie l'enrollment via le chaincode avant de télécharger
 *
 * Retourne: Le fichier binaire
 */
router.get('/:materialId/download', authenticate, async (req, res) => {
    try {
        const { materialId } = req.params;
        const { userId, orgMSP } = req.user;

        console.log(`📥 GET /api/materials/${materialId}/download by ${userId}`);

        // 1. Récupérer le hash IPFS depuis la blockchain (vérifie enrollment)
        const materialData = await fabricService.evaluateTransaction(
            userId,
            orgMSP,
            'MaterialContract',
            'GetMaterialFile',
            materialId
        );

        if (!materialData || !materialData.ipfsHash) {
            return res.status(404).json({
                success: false,
                error: 'Material not found or IPFS hash missing'
            });
        }

        console.log(`   IPFS hash retrieved: ${materialData.ipfsHash}`);

        // 2. Télécharger le fichier depuis IPFS
        const fileBuffer = await ipfsService.downloadFile(materialData.ipfsHash);

        console.log(`   File downloaded from IPFS: ${fileBuffer.length} bytes`);

        // 3. Déterminer le type MIME et le nom de fichier
        const fileName = materialData.title || `material-${materialId}`;
        const mimeType = materialData.mimeType || 'application/octet-stream';

        // 4. Envoyer le fichier au client
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.setHeader('Content-Length', fileBuffer.length);
        res.setHeader('X-IPFS-Hash', materialData.ipfsHash);

        res.send(fileBuffer);

    } catch (error) {
        console.error('Error downloading material:', error);

        if (error.message.includes('does not exist')) {
            return res.status(404).json({
                success: false,
                error: `Material ${req.params.materialId} not found`
            });
        }

        if (error.message.includes('Access denied') || error.message.includes('must be enrolled')) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. You must be enrolled in this class to download materials.'
            });
        }

        if (error.message.includes('IPFS')) {
            return res.status(503).json({
                success: false,
                error: `IPFS service error: ${error.message}`
            });
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/ipfs/status
 * Vérifier l'état de la connexion IPFS
 *
 * Requiert authentification + rôle teacher
 */
router.get('/ipfs/status', authenticate, authorize(['teacher']), async (req, res) => {
    try {
        const status = await ipfsService.getStatus();

        res.json({
            success: true,
            data: status
        });

    } catch (error) {
        console.error('Error checking IPFS status:', error);

        res.status(503).json({
            success: false,
            error: 'IPFS service unavailable',
            details: error.message
        });
    }
});

// Middleware de gestion d'erreurs pour Multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                success: false,
                error: 'File too large. Maximum size is 50MB.'
            });
        }
        return res.status(400).json({
            success: false,
            error: `Upload error: ${error.message}`
        });
    }

    if (error.message.includes('Type de fichier non autorisé')) {
        return res.status(415).json({
            success: false,
            error: error.message
        });
    }

    next(error);
});

module.exports = router;
