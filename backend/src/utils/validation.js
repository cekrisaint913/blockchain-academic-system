

const Joi = require('joi');

const schemas = {
    createClass: Joi.object({
        classId: Joi.string().alphanum().min(3).max(20).required(),
        name: Joi.string().min(3).max(100).required(),
        description: Joi.string().min(10).max(500).required(),
        teacher: Joi.string().min(3).max(100).required(),
        semester: Joi.string().min(3).max(50).required(),
        maxStudents: Joi.number().integer().min(1).max(500).required()
    }),

    enrollStudent: Joi.object({
        classId: Joi.string().alphanum().required(),
        studentId: Joi.string().required()
    }),

    uploadMaterial: Joi.object({
        materialId: Joi.string().required(),
        classId: Joi.string().required(),
        title: Joi.string().min(3).max(200).required(),
        type: Joi.string().valid('lecture', 'lab', 'exercise').required()
    }),

    createExam: Joi.object({
        examId: Joi.string().required(),
        classId: Joi.string().required(),
        title: Joi.string().min(3).max(200).required(),
        examDate: Joi.date().iso().required()
    }),

    submitGrade: Joi.object({
        gradeId: Joi.string().required(),
        examId: Joi.string().required(),
        studentId: Joi.string().required(),
        score: Joi.number().min(0).required(),
        maxScore: Joi.number().min(0).required()
    }),

    login: Joi.object({
        username: Joi.string().pattern(/^[a-zA-Z0-9_]{3,30}$/).required()
            .messages({
                'string.pattern.base': 'Username must be 3-30 characters and contain only letters, numbers, and underscores'
            }),
        password: Joi.string().min(6).required()
    })
};

const validate = (schema) => {
    return (req, res, next) => {
        const { error } = schemas[schema].validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                error: error.details[0].message
            });
        }
        next();
    };
};

module.exports = { validate, schemas };
