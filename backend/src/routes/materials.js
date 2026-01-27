

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fabricClient = require('../config/fabric');
const ipfsService = require('../services/ipfsService');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/security');
const logger = require('../utils/logger');

// Configuration Multer pour l'upload de fichiers
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || ['pdf', 'docx', 'pptx'];
        const ext = path.extname(file.originalname).toLowerCase().slice(1);
        
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`File type .${ext} not allowed`));
        }
    }
});

// POST /api/materials/upload - Upload d'un support de cours
router.post(
    '/upload',
    authenticateToken,
    requireRole(['teacher']),
    auditLog('UPLOAD_MATERIAL'),
    upload.single('file'),
    async (req, res, next) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No file uploaded'
                });
            }

            const { materialId, classId, title, type } = req.body;

            // Validation
            if (!materialId || !classId || !title || !type) {
                return res.status(400).json({
                    success: false,
                    error: 'materialId, classId, title, and type are required'
                });
            }

            // Upload vers IPFS
            let ipfsHash = 'QmDEMO' + Date.now(); // Hash de démo

            const ipfsAvailable = await ipfsService.isAvailable();
            if (ipfsAvailable) {
                try {
                    const ipfsResult = await ipfsService.uploadFile(req.file.path);
                    ipfsHash = ipfsResult.hash;
                    logger.info(`File uploaded to IPFS: ${ipfsHash}`);
                } catch (ipfsError) {
                    logger.warn(`IPFS upload failed, using demo hash: ${ipfsError.message}`);
                }
            } else {
                logger.warn('IPFS not available, using demo hash');
            }

            // Enregistrer dans la blockchain
            await fabricClient.submitTransaction(
                req.user.username,
                'UploadMaterial',
                materialId,
                classId,
                title,
                type,
                ipfsHash,
                req.user.username
            );

            logger.info(`Material ${materialId} uploaded by ${req.user.username}`);

            res.status(201).json({
                success: true,
                message: 'Material uploaded successfully',
                data: {
                    materialId,
                    classId,
                    title,
                    type,
                    ipfsHash,
                    filename: req.file.filename
                }
            });
        } catch (error) {
            logger.error(`Material upload failed: ${error.message}`);
            next(error);
        }
    }
);

// GET /api/materials/:hash - Télécharger un fichier depuis IPFS
router.get(
    '/:hash',
    authenticateToken,
    async (req, res, next) => {
        try {
            const { hash } = req.params;

            const ipfsAvailable = await ipfsService.isAvailable();
            if (!ipfsAvailable) {
                return res.status(503).json({
                    success: false,
                    error: 'IPFS service unavailable'
                });
            }

            const file = await ipfsService.getFile(hash);

            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${hash}"`);
            res.send(file);
        } catch (error) {
            logger.error(`Material download failed: ${error.message}`);
            next(error);
        }
    }
);

module.exports = router;
