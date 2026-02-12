/*
 * Routes - Classes
 *
 * Endpoints pour la gestion des classes via ClassContract
 */

'use strict';

const express = require('express');
const router = express.Router();
const fabricService = require('../services/fabricService');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * GET /api/classes
 * Lister toutes les classes (PUBLIC - pas d'auth requise)
 *
 * Retourne uniquement: id, name, description (pas de modules ni enrolledStudents)
 */
router.get('/', async (req, res) => {
    try {
        console.log('📥 GET /api/classes - Liste publique des classes');

        // Utiliser une identité publique ou admin pour la requête
        // Pour une requête publique, on peut utiliser n'importe quelle identité
        // Ici on utilise un admin par défaut
        const userId = 'Admin@school.academic.edu';
        const orgMSP = 'SchoolMSP';

        const result = await fabricService.evaluateTransaction(
            userId,
            orgMSP,
            'ClassContract',
            'GetAllClasses'
        );

        res.json({
            success: true,
            count: result.length,
            data: result
        });

    } catch (error) {
        console.error('Error fetching classes:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/classes/:classId
 * Obtenir les détails d'une classe
 *
 * Requiert authentification
 * Retourne: Informations complètes (modules, enrolledStudents)
 */
router.get('/:classId', authenticate, async (req, res) => {
    try {
        const { classId } = req.params;
        const { userId, orgMSP } = req.user;

        console.log(`📥 GET /api/classes/${classId} by ${userId}`);

        const result = await fabricService.evaluateTransaction(
            userId,
            orgMSP,
            'ClassContract',
            'GetClassDetails',
            classId
        );

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error fetching class details:', error);

        // Gérer les erreurs spécifiques
        if (error.message.includes('does not exist')) {
            return res.status(404).json({
                success: false,
                error: `Class ${req.params.classId} not found`
            });
        }

        if (error.message.includes('Access Denied') || error.message.includes('authenticated')) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. You must be authenticated to view class details.'
            });
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/classes
 * Créer une nouvelle classe
 *
 * Requiert authentification + rôle teacher
 *
 * Body: { classId, name, description }
 */
router.post('/', authenticate, authorize(['teacher']), async (req, res) => {
    try {
        const { classId, name, description } = req.body;
        const { userId, orgMSP } = req.user;

        // Validation
        if (!classId || !name || !description) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: classId, name, description'
            });
        }

        console.log(`📤 POST /api/classes - Creating class ${classId} by ${userId}`);

        const result = await fabricService.submitTransaction(
            userId,
            orgMSP,
            'ClassContract',
            'CreateClass',
            classId,
            name,
            description
        );

        res.status(201).json({
            success: true,
            data: {
                classId: result,
                message: `Class ${classId} created successfully`
            }
        });

    } catch (error) {
        console.error('Error creating class:', error);

        if (error.message.includes('Access Denied')) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Only teachers can create classes.'
            });
        }

        if (error.message.includes('already exists')) {
            return res.status(409).json({
                success: false,
                error: `Class ${req.body.classId} already exists`
            });
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/classes/:classId/enroll
 * Inscrire un étudiant à une classe
 *
 * Requiert authentification
 * Teachers peuvent inscrire n'importe qui
 * Students peuvent uniquement s'inscrire eux-mêmes
 *
 * Body: { studentId } (optionnel pour students, obligatoire pour teachers)
 */
router.post('/:classId/enroll', authenticate, async (req, res) => {
    try {
        const { classId } = req.params;
        const { userId, orgMSP, role } = req.user;
        let { studentId } = req.body;

        // Si c'est un étudiant et qu'il n'a pas fourni de studentId,
        // utiliser son propre userId
        if (role === 'student' && !studentId) {
            studentId = userId;
        }

        // Validation
        if (!studentId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: studentId'
            });
        }

        console.log(`📤 POST /api/classes/${classId}/enroll - Enrolling ${studentId} by ${userId}`);

        const result = await fabricService.submitTransaction(
            userId,
            orgMSP,
            'ClassContract',
            'EnrollStudent',
            classId,
            studentId
        );

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error enrolling student:', error);

        if (error.message.includes('does not exist')) {
            return res.status(404).json({
                success: false,
                error: `Class ${req.params.classId} not found`
            });
        }

        if (error.message.includes('Access Denied') || error.message.includes('can only enroll themselves')) {
            return res.status(403).json({
                success: false,
                error: error.message
            });
        }

        if (error.message.includes('already enrolled')) {
            return res.status(409).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/classes/:classId/students
 * Obtenir la liste des étudiants inscrits
 *
 * Requiert authentification + rôle teacher
 */
router.get('/:classId/students', authenticate, authorize(['teacher']), async (req, res) => {
    try {
        const { classId } = req.params;
        const { userId, orgMSP } = req.user;

        console.log(`📥 GET /api/classes/${classId}/students by ${userId}`);

        const result = await fabricService.evaluateTransaction(
            userId,
            orgMSP,
            'ClassContract',
            'GetEnrolledStudents',
            classId
        );

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error fetching enrolled students:', error);

        if (error.message.includes('does not exist')) {
            return res.status(404).json({
                success: false,
                error: `Class ${req.params.classId} not found`
            });
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
