

const fabricClient = require('../config/fabric');
const logger = require('../utils/logger');

// Récupérer toutes les classes (PUBLIC - pas d'auth requise)
exports.getAllClasses = async (req, res, next) => {
    try {
        // Utiliser une identité admin pour les requêtes publiques
        const classes = await fabricClient.evaluateTransaction(
            'admin',
            'GetAllClasses'
        );

        logger.info('Public query: GetAllClasses');
        res.json({
            success: true,
            count: classes.length,
            data: classes
        });
    } catch (error) {
        logger.error(`GetAllClasses failed: ${error.message}`);
        next(error);
    }
};

// Récupérer une classe spécifique
exports.getClassById = async (req, res, next) => {
    try {
        const { classId } = req.params;
        
        const classData = await fabricClient.evaluateTransaction(
            req.user.username,
            'GetClass',
            classId
        );

        res.json({
            success: true,
            data: classData
        });
    } catch (error) {
        logger.error(`GetClass failed: ${error.message}`);
        if (error.message.includes('does not exist')) {
            return res.status(404).json({
                success: false,
                error: 'Class not found'
            });
        }
        next(error);
    }
};

// Créer une nouvelle classe (TEACHER uniquement)
exports.createClass = async (req, res, next) => {
    try {
        const { classId, name, description, teacher, semester, maxStudents } = req.body;

        // Vérifier que l'utilisateur est enseignant
        if (req.user.role !== 'teacher') {
            return res.status(403).json({
                success: false,
                error: 'Only teachers can create classes'
            });
        }

        const result = await fabricClient.submitTransaction(
            req.user.username,
            'CreateClass',
            classId,
            name,
            description,
            teacher,
            semester,
            maxStudents.toString()
        );

        logger.info(`Class created: ${classId} by ${req.user.username}`);

        res.status(201).json({
            success: true,
            message: 'Class created successfully',
            data: result
        });
    } catch (error) {
        logger.error(`CreateClass failed: ${error.message}`);
        if (error.message.includes('already exists')) {
            return res.status(409).json({
                success: false,
                error: 'Class already exists'
            });
        }
        next(error);
    }
};

// Inscription d'un étudiant
exports.enrollStudent = async (req, res, next) => {
    try {
        const { classId } = req.params;
        const { studentId } = req.body;

        // Vérifier que l'utilisateur est étudiant
        if (req.user.role !== 'student') {
            return res.status(403).json({
                success: false,
                error: 'Only students can enroll'
            });
        }

        const result = await fabricClient.submitTransaction(
            req.user.username,
            'EnrollStudent',
            classId,
            studentId
        );

        logger.info(`Student ${studentId} enrolled in ${classId}`);

        res.json({
            success: true,
            message: 'Successfully enrolled',
            data: result
        });
    } catch (error) {
        logger.error(`EnrollStudent failed: ${error.message}`);
        if (error.message.includes('already enrolled')) {
            return res.status(409).json({
                success: false,
                error: 'Already enrolled in this class'
            });
        }
        next(error);
    }
};

// Récupérer les supports de cours d'une classe
exports.getClassMaterials = async (req, res, next) => {
    try {
        const { classId } = req.params;

        const materials = await fabricClient.evaluateTransaction(
            req.user.username,
            'GetClassMaterials',
            classId
        );

        res.json({
            success: true,
            count: materials.length,
            data: materials
        });
    } catch (error) {
        logger.error(`GetClassMaterials failed: ${error.message}`);
        next(error);
    }
};

module.exports = exports;
