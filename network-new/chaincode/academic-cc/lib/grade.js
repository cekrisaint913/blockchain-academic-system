/*
 * Grade Management Smart Contract
 *
 * Contrôle d'accès:
 * - Publication: SchoolMSP uniquement (teachers)
 * - Consultation: Étudiants voient UNIQUEMENT leurs propres notes
 * - Teachers voient toutes les notes
 * - Utilise CouchDB rich queries pour optimisation
 */

'use strict';

const { Contract } = require('fabric-contract-api');

class GradeContract extends Contract {

    // ==================== CONTRÔLES D'ACCÈS ====================

    /**
     * Vérifie si l'appelant appartient à SchoolOrg (teachers/admin)
     */
    _isSchoolMember(ctx) {
        const mspID = ctx.clientIdentity.getMSPID();
        return mspID === 'SchoolMSP';
    }

    /**
     * Vérifie si l'appelant appartient à StudentsOrg
     */
    _isStudentMember(ctx) {
        const mspID = ctx.clientIdentity.getMSPID();
        return mspID === 'StudentsMSP';
    }

    /**
     * Récupère l'ID de l'utilisateur appelant
     * Format: x509::/CN=User1@school.academic.edu/...
     */
    _getCallerIdentity(ctx) {
        const userID = ctx.clientIdentity.getID();
        // Extraire le CN (Common Name) de l'identité X.509
        const match = userID.match(/CN=([^,/]+)/);
        return match ? match[1] : userID;
    }

    /**
     * Vérifie si l'appelant peut accéder aux notes d'un étudiant
     *
     * RÈGLE CRITIQUE:
     * - Teachers: Peuvent voir toutes les notes
     * - Students: Peuvent voir UNIQUEMENT leurs propres notes
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} studentId - ID de l'étudiant dont on veut voir les notes
     * @returns {boolean}
     * @throws {Error} Si l'accès est refusé
     */
    _canAccessGrade(ctx, studentId) {
        const callerId = this._getCallerIdentity(ctx);
        const mspID = ctx.clientIdentity.getMSPID();

        // Teachers peuvent voir toutes les notes
        if (this._isSchoolMember(ctx)) {
            console.info(`✅ Access granted: ${callerId} is a teacher (SchoolMSP)`);
            return true;
        }

        // Étudiants ne peuvent voir que leurs propres notes
        if (this._isStudentMember(ctx)) {
            if (callerId === studentId) {
                console.info(`✅ Access granted: ${callerId} accessing own grades`);
                return true;
            } else {
                throw new Error(`Access denied: You can only view your own grades (You: ${callerId}, Requested: ${studentId})`);
            }
        }

        throw new Error('Access denied: You must be a member of SchoolOrg or StudentsOrg');
    }

    /**
     * Vérifie si l'appelant a accès à une classe
     * - Teachers (SchoolMSP) : accès à tout
     * - Students (StudentsMSP) : doivent être inscrits
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} classId - ID de la classe
     * @returns {Promise<boolean>}
     * @throws {Error} Si l'utilisateur n'est pas inscrit
     */
    async _checkEnrollment(ctx, classId, studentId) {
        const caller = this._getCallerIdentity(ctx);
        const mspID = ctx.clientIdentity.getMSPID();

        console.info(`Checking enrollment for ${studentId} in class ${classId}`);

        // Teachers ont accès à tout
        if (this._isSchoolMember(ctx)) {
            console.info(`✅ Access granted: ${caller} is a teacher (SchoolMSP)`);
            return true;
        }

        // Récupérer la classe
        const classAsBytes = await ctx.stub.getState(classId);

        if (!classAsBytes || classAsBytes.length === 0) {
            throw new Error(`Class ${classId} does not exist`);
        }

        const classData = JSON.parse(classAsBytes.toString());

        // Vérifier que c'est bien une classe
        if (classData.docType !== 'class') {
            throw new Error(`${classId} is not a valid class`);
        }

        // Vérifier si l'étudiant est inscrit
        if (!classData.enrolledStudents.includes(studentId)) {
            throw new Error(`Student ${studentId} is not enrolled in class ${classId}`);
        }

        console.info(`✅ Student ${studentId} is enrolled in class ${classId}`);
        return true;
    }

    // ==================== FONCTIONS MÉTIER ====================

    /**
     * 1. Publier une note
     *
     * Accessible par: SchoolOrg uniquement (teachers)
     * Vérifie que l'étudiant est inscrit dans la classe de l'examen
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} gradeId - ID unique de la note (ex: "grade-exam1-student1")
     * @param {string} examId - ID de l'examen
     * @param {string} studentId - ID de l'étudiant (ex: "student1@students.academic.edu")
     * @param {number} score - Note obtenue (ex: 15.5)
     * @param {string} comment - Commentaire du professeur
     * @returns {string} gradeId
     */
    async PublishGrade(ctx, gradeId, examId, studentId, score, comment) {
        console.info('============= START : PublishGrade ===========');

        // CONTRÔLE D'ACCÈS: Seulement SchoolOrg peut publier des notes
        if (!this._isSchoolMember(ctx)) {
            throw new Error('Access Denied: Only SchoolOrg members (teachers) can publish grades');
        }

        // Vérifier que l'examen existe
        const examAsBytes = await ctx.stub.getState(examId);
        if (!examAsBytes || examAsBytes.length === 0) {
            throw new Error(`Exam ${examId} does not exist`);
        }

        const exam = JSON.parse(examAsBytes.toString());

        // Vérifier que c'est bien un examen
        if (exam.docType !== 'exam') {
            throw new Error(`${examId} is not an exam`);
        }

        // Vérifier que l'étudiant est inscrit dans la classe de l'examen
        await this._checkEnrollment(ctx, exam.classId, studentId);

        // Vérifier que la note n'existe pas déjà
        const exists = await ctx.stub.getState(gradeId);
        if (exists && exists.length > 0) {
            throw new Error(`Grade ${gradeId} already exists. Use UpdateGrade to modify it.`);
        }

        // Valider le score
        const scoreNum = parseFloat(score);
        if (isNaN(scoreNum) || scoreNum < 0) {
            throw new Error('Invalid score: must be a positive number');
        }

        // Récupérer l'identité du professeur
        const publishedBy = this._getCallerIdentity(ctx);
        const publishedAt = new Date().toISOString();

        // Créer l'objet note
        const grade = {
            docType: 'grade',
            id: gradeId,
            examId: examId,
            classId: exam.classId, // Stocker classId pour requêtes optimisées
            studentId: studentId,
            score: scoreNum,
            comment: comment || '',
            publishedBy: publishedBy,
            publishedAt: publishedAt,
        };

        // Stocker dans le ledger
        await ctx.stub.putState(gradeId, Buffer.from(JSON.stringify(grade)));

        // Émettre un événement
        ctx.stub.setEvent('GradePublished', Buffer.from(JSON.stringify({
            gradeId: gradeId,
            examId: examId,
            studentId: studentId,
            score: scoreNum,
            publishedBy: publishedBy,
        })));

        console.info(`✅ Grade published: ${gradeId} for student ${studentId} by ${publishedBy}`);
        console.info('============= END : PublishGrade ===========');

        return gradeId;
    }

    /**
     * 2. Obtenir MES notes (de la classe)
     *
     * RÈGLE CRITIQUE: L'étudiant ne voit QUE ses propres notes
     * Teachers voient toutes les notes de la classe
     *
     * Accessible par: Étudiants (leurs notes) + Teachers (toutes les notes)
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} classId - ID de la classe
     * @returns {string} JSON array des notes
     */
    async GetMyGrades(ctx, classId) {
        console.info('============= START : GetMyGrades ===========');

        const callerId = this._getCallerIdentity(ctx);
        const isTeacher = this._isSchoolMember(ctx);

        // Vérifier que la classe existe
        const classAsBytes = await ctx.stub.getState(classId);
        if (!classAsBytes || classAsBytes.length === 0) {
            throw new Error(`Class ${classId} does not exist`);
        }

        let queryString;

        if (isTeacher) {
            // Teachers voient toutes les notes de la classe
            queryString = JSON.stringify({
                selector: {
                    docType: 'grade',
                    classId: classId
                }
            });
        } else {
            // Étudiants voient uniquement leurs propres notes
            queryString = JSON.stringify({
                selector: {
                    docType: 'grade',
                    classId: classId,
                    studentId: callerId
                }
            });
        }

        const allResults = [];

        try {
            // Utiliser CouchDB rich query pour optimisation
            const iterator = await ctx.stub.getQueryResult(queryString);
            let result = await iterator.next();

            while (!result.done) {
                const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
                let record;

                try {
                    record = JSON.parse(strValue);

                    // Pour chaque note, récupérer les détails de l'examen
                    const examAsBytes = await ctx.stub.getState(record.examId);
                    if (examAsBytes && examAsBytes.length > 0) {
                        const exam = JSON.parse(examAsBytes.toString());

                        allResults.push({
                            id: record.id,
                            examId: record.examId,
                            examTitle: exam.title || 'Unknown',
                            examDate: exam.examDate || null,
                            moduleId: exam.moduleId || null,
                            studentId: record.studentId,
                            score: record.score,
                            comment: record.comment,
                            publishedBy: record.publishedBy,
                            publishedAt: record.publishedAt,
                        });
                    } else {
                        // Si l'examen n'existe plus, retourner quand même la note
                        allResults.push({
                            id: record.id,
                            examId: record.examId,
                            examTitle: 'Exam deleted',
                            studentId: record.studentId,
                            score: record.score,
                            comment: record.comment,
                            publishedBy: record.publishedBy,
                            publishedAt: record.publishedAt,
                        });
                    }
                } catch (err) {
                    console.log('Error parsing grade record:', err);
                }

                result = await iterator.next();
            }

            await iterator.close();
        } catch (err) {
            // Si CouchDB n'est pas disponible, fallback sur getStateByRange
            console.warn('CouchDB query failed, using fallback method:', err);
            return await this._getMyGradesFallback(ctx, classId, callerId, isTeacher);
        }

        console.info(`✅ Retrieved ${allResults.length} grades for ${callerId} in class ${classId}`);
        console.info('============= END : GetMyGrades ===========');

        return JSON.stringify(allResults);
    }

    /**
     * 3. Obtenir les notes d'un étudiant spécifique
     *
     * Accessible par: Teachers (tous étudiants) + Étudiants (eux-mêmes uniquement)
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} studentId - ID de l'étudiant
     * @param {string} classId - ID de la classe
     * @returns {string} JSON array des notes de l'étudiant
     */
    async GetStudentGrades(ctx, studentId, classId) {
        console.info('============= START : GetStudentGrades ===========');

        // CONTRÔLE D'ACCÈS: Vérifier si l'appelant peut accéder aux notes de cet étudiant
        this._canAccessGrade(ctx, studentId);

        // Vérifier que la classe existe
        const classAsBytes = await ctx.stub.getState(classId);
        if (!classAsBytes || classAsBytes.length === 0) {
            throw new Error(`Class ${classId} does not exist`);
        }

        const queryString = JSON.stringify({
            selector: {
                docType: 'grade',
                classId: classId,
                studentId: studentId
            }
        });

        const allResults = [];

        try {
            // Utiliser CouchDB rich query
            const iterator = await ctx.stub.getQueryResult(queryString);
            let result = await iterator.next();

            while (!result.done) {
                const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
                let record;

                try {
                    record = JSON.parse(strValue);

                    // Récupérer les détails de l'examen
                    const examAsBytes = await ctx.stub.getState(record.examId);
                    if (examAsBytes && examAsBytes.length > 0) {
                        const exam = JSON.parse(examAsBytes.toString());

                        allResults.push({
                            id: record.id,
                            examId: record.examId,
                            examTitle: exam.title || 'Unknown',
                            examDate: exam.examDate || null,
                            moduleId: exam.moduleId || null,
                            score: record.score,
                            comment: record.comment,
                            publishedBy: record.publishedBy,
                            publishedAt: record.publishedAt,
                        });
                    }
                } catch (err) {
                    console.log('Error parsing grade record:', err);
                }

                result = await iterator.next();
            }

            await iterator.close();
        } catch (err) {
            // Fallback si CouchDB non disponible
            console.warn('CouchDB query failed, using fallback method:', err);
            return await this._getStudentGradesFallback(ctx, studentId, classId);
        }

        const callerId = this._getCallerIdentity(ctx);
        console.info(`✅ Retrieved ${allResults.length} grades for student ${studentId} by ${callerId}`);
        console.info('============= END : GetStudentGrades ===========');

        return JSON.stringify(allResults);
    }

    /**
     * 4. Obtenir toutes les notes d'une classe
     *
     * Accessible par: Teachers uniquement
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} classId - ID de la classe
     * @returns {string} JSON array de toutes les notes de la classe
     */
    async GetClassGrades(ctx, classId) {
        console.info('============= START : GetClassGrades ===========');

        // CONTRÔLE D'ACCÈS: Seulement les teachers
        if (!this._isSchoolMember(ctx)) {
            throw new Error('Access Denied: Only teachers can view all class grades');
        }

        // Vérifier que la classe existe
        const classAsBytes = await ctx.stub.getState(classId);
        if (!classAsBytes || classAsBytes.length === 0) {
            throw new Error(`Class ${classId} does not exist`);
        }

        const queryString = JSON.stringify({
            selector: {
                docType: 'grade',
                classId: classId
            },
            sort: [
                { studentId: 'asc' },
                { publishedAt: 'desc' }
            ]
        });

        const allResults = [];

        try {
            // Utiliser CouchDB rich query avec tri
            const iterator = await ctx.stub.getQueryResult(queryString);
            let result = await iterator.next();

            while (!result.done) {
                const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
                let record;

                try {
                    record = JSON.parse(strValue);

                    // Récupérer les détails de l'examen
                    const examAsBytes = await ctx.stub.getState(record.examId);
                    if (examAsBytes && examAsBytes.length > 0) {
                        const exam = JSON.parse(examAsBytes.toString());

                        allResults.push({
                            id: record.id,
                            examId: record.examId,
                            examTitle: exam.title || 'Unknown',
                            examDate: exam.examDate || null,
                            moduleId: exam.moduleId || null,
                            studentId: record.studentId,
                            score: record.score,
                            comment: record.comment,
                            publishedBy: record.publishedBy,
                            publishedAt: record.publishedAt,
                        });
                    }
                } catch (err) {
                    console.log('Error parsing grade record:', err);
                }

                result = await iterator.next();
            }

            await iterator.close();
        } catch (err) {
            // Fallback si CouchDB non disponible
            console.warn('CouchDB query failed, using fallback method:', err);
            return await this._getClassGradesFallback(ctx, classId);
        }

        const callerId = this._getCallerIdentity(ctx);
        console.info(`✅ Retrieved ${allResults.length} grades for class ${classId} by ${callerId}`);
        console.info('============= END : GetClassGrades ===========');

        return JSON.stringify(allResults);
    }

    // ==================== FONCTIONS FALLBACK (sans CouchDB) ====================

    /**
     * Fallback pour GetMyGrades si CouchDB non disponible
     */
    async _getMyGradesFallback(ctx, classId, callerId, isTeacher) {
        const allResults = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();

        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;

            try {
                record = JSON.parse(strValue);

                if (record.docType === 'grade' && record.classId === classId) {
                    // Teachers voient tout, étudiants seulement leurs notes
                    if (isTeacher || record.studentId === callerId) {
                        const examAsBytes = await ctx.stub.getState(record.examId);
                        if (examAsBytes && examAsBytes.length > 0) {
                            const exam = JSON.parse(examAsBytes.toString());
                            allResults.push({
                                id: record.id,
                                examId: record.examId,
                                examTitle: exam.title || 'Unknown',
                                examDate: exam.examDate || null,
                                studentId: record.studentId,
                                score: record.score,
                                comment: record.comment,
                                publishedBy: record.publishedBy,
                                publishedAt: record.publishedAt,
                            });
                        }
                    }
                }
            } catch (err) {
                console.log('Error parsing record:', err);
            }

            result = await iterator.next();
        }

        await iterator.close();
        return JSON.stringify(allResults);
    }

    /**
     * Fallback pour GetStudentGrades si CouchDB non disponible
     */
    async _getStudentGradesFallback(ctx, studentId, classId) {
        const allResults = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();

        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;

            try {
                record = JSON.parse(strValue);

                if (record.docType === 'grade' &&
                    record.classId === classId &&
                    record.studentId === studentId) {
                    const examAsBytes = await ctx.stub.getState(record.examId);
                    if (examAsBytes && examAsBytes.length > 0) {
                        const exam = JSON.parse(examAsBytes.toString());
                        allResults.push({
                            id: record.id,
                            examId: record.examId,
                            examTitle: exam.title || 'Unknown',
                            examDate: exam.examDate || null,
                            score: record.score,
                            comment: record.comment,
                            publishedBy: record.publishedBy,
                            publishedAt: record.publishedAt,
                        });
                    }
                }
            } catch (err) {
                console.log('Error parsing record:', err);
            }

            result = await iterator.next();
        }

        await iterator.close();
        return JSON.stringify(allResults);
    }

    /**
     * Fallback pour GetClassGrades si CouchDB non disponible
     */
    async _getClassGradesFallback(ctx, classId) {
        const allResults = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();

        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;

            try {
                record = JSON.parse(strValue);

                if (record.docType === 'grade' && record.classId === classId) {
                    const examAsBytes = await ctx.stub.getState(record.examId);
                    if (examAsBytes && examAsBytes.length > 0) {
                        const exam = JSON.parse(examAsBytes.toString());
                        allResults.push({
                            id: record.id,
                            examId: record.examId,
                            examTitle: exam.title || 'Unknown',
                            examDate: exam.examDate || null,
                            studentId: record.studentId,
                            score: record.score,
                            comment: record.comment,
                            publishedBy: record.publishedBy,
                            publishedAt: record.publishedAt,
                        });
                    }
                }
            } catch (err) {
                console.log('Error parsing record:', err);
            }

            result = await iterator.next();
        }

        await iterator.close();
        return JSON.stringify(allResults);
    }

    // ==================== FONCTIONS UTILITAIRES BONUS ====================

    /**
     * Mettre à jour une note existante
     * Accessible par: Teachers uniquement
     */
    async UpdateGrade(ctx, gradeId, newScore, newComment) {
        console.info('============= START : UpdateGrade ===========');

        if (!this._isSchoolMember(ctx)) {
            throw new Error('Access Denied: Only teachers can update grades');
        }

        const gradeAsBytes = await ctx.stub.getState(gradeId);
        if (!gradeAsBytes || gradeAsBytes.length === 0) {
            throw new Error(`Grade ${gradeId} does not exist`);
        }

        const grade = JSON.parse(gradeAsBytes.toString());

        if (grade.docType !== 'grade') {
            throw new Error(`${gradeId} is not a grade`);
        }

        // Valider le nouveau score
        const scoreNum = parseFloat(newScore);
        if (isNaN(scoreNum) || scoreNum < 0) {
            throw new Error('Invalid score: must be a positive number');
        }

        // Mettre à jour
        grade.score = scoreNum;
        grade.comment = newComment || grade.comment;
        grade.updatedBy = this._getCallerIdentity(ctx);
        grade.updatedAt = new Date().toISOString();

        await ctx.stub.putState(gradeId, Buffer.from(JSON.stringify(grade)));

        ctx.stub.setEvent('GradeUpdated', Buffer.from(JSON.stringify({
            gradeId: gradeId,
            studentId: grade.studentId,
            newScore: scoreNum,
            updatedBy: grade.updatedBy,
        })));

        console.info(`✅ Grade updated: ${gradeId}`);
        console.info('============= END : UpdateGrade ===========');

        return JSON.stringify({
            success: true,
            message: `Grade ${gradeId} successfully updated`,
        });
    }

    /**
     * Supprimer une note
     * Accessible par: Teachers uniquement
     */
    async DeleteGrade(ctx, gradeId) {
        console.info('============= START : DeleteGrade ===========');

        if (!this._isSchoolMember(ctx)) {
            throw new Error('Access Denied: Only teachers can delete grades');
        }

        const gradeAsBytes = await ctx.stub.getState(gradeId);
        if (!gradeAsBytes || gradeAsBytes.length === 0) {
            throw new Error(`Grade ${gradeId} does not exist`);
        }

        const grade = JSON.parse(gradeAsBytes.toString());

        if (grade.docType !== 'grade') {
            throw new Error(`${gradeId} is not a grade`);
        }

        await ctx.stub.deleteState(gradeId);

        const caller = this._getCallerIdentity(ctx);

        ctx.stub.setEvent('GradeDeleted', Buffer.from(JSON.stringify({
            gradeId: gradeId,
            studentId: grade.studentId,
            deletedBy: caller,
        })));

        console.info(`✅ Grade deleted: ${gradeId} by ${caller}`);
        console.info('============= END : DeleteGrade ===========');

        return JSON.stringify({
            success: true,
            message: `Grade ${gradeId} successfully deleted`,
        });
    }

    /**
     * Obtenir une note spécifique
     * Accessible par: Teacher + Étudiant concerné
     */
    async GetGrade(ctx, gradeId) {
        console.info('============= START : GetGrade ===========');

        const gradeAsBytes = await ctx.stub.getState(gradeId);
        if (!gradeAsBytes || gradeAsBytes.length === 0) {
            throw new Error(`Grade ${gradeId} does not exist`);
        }

        const grade = JSON.parse(gradeAsBytes.toString());

        if (grade.docType !== 'grade') {
            throw new Error(`${gradeId} is not a grade`);
        }

        // Vérifier l'accès
        this._canAccessGrade(ctx, grade.studentId);

        console.info(`✅ Grade retrieved: ${gradeId}`);
        console.info('============= END : GetGrade ===========');

        return JSON.stringify(grade);
    }
}

module.exports = GradeContract;
