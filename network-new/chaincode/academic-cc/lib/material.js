/*
 * Course Material Management Smart Contract
 *
 * Contrôle d'accès:
 * - Upload: SchoolMSP uniquement (teachers)
 * - Accès aux matériaux: Étudiants inscrits + Teachers
 * - Stockage IPFS off-chain, hash stocké on-chain
 */

'use strict';

const { Contract } = require('fabric-contract-api');

class MaterialContract extends Contract {

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
     * Vérifie si l'appelant a accès à une classe
     * - Teachers (SchoolMSP) : accès à tout
     * - Students (StudentsMSP) : doivent être inscrits
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} classId - ID de la classe
     * @returns {Promise<boolean>}
     * @throws {Error} Si l'utilisateur n'est pas inscrit
     */
    async _checkEnrollment(ctx, classId) {
        const caller = this._getCallerIdentity(ctx);
        const mspID = ctx.clientIdentity.getMSPID();

        console.info(`Checking enrollment for ${caller} (${mspID}) in class ${classId}`);

        // Teachers ont accès à tout
        if (this._isSchoolMember(ctx)) {
            console.info(`✅ Access granted: ${caller} is a teacher (SchoolMSP)`);
            return true;
        }

        // Pour les étudiants, vérifier l'enrollment
        if (this._isStudentMember(ctx)) {
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
            if (!classData.enrolledStudents.includes(caller)) {
                throw new Error(`Access denied: You must be enrolled in class ${classId} to access materials`);
            }

            console.info(`✅ Access granted: ${caller} is enrolled in class ${classId}`);
            return true;
        }

        // Si ni teacher ni student
        throw new Error('Access denied: You must be a member of SchoolOrg or StudentsOrg');
    }

    // ==================== FONCTIONS MÉTIER ====================

    /**
     * 1. Upload un support de cours
     *
     * Accessible par: SchoolOrg uniquement (teachers)
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} materialId - ID unique du support (ex: "MAT001")
     * @param {string} classId - ID de la classe
     * @param {string} moduleId - ID du module/chapitre
     * @param {string} title - Titre du support
     * @param {string} type - Type: "COURS" ou "TP"
     * @param {string} ipfsHash - Hash IPFS du fichier
     * @returns {string} materialId
     */
    async UploadCourseMaterial(ctx, materialId, classId, moduleId, title, type, ipfsHash) {
        console.info('============= START : UploadCourseMaterial ===========');

        // CONTRÔLE D'ACCÈS: Seulement SchoolOrg peut uploader
        if (!this._isSchoolMember(ctx)) {
            throw new Error('Access Denied: Only SchoolOrg members (teachers) can upload materials');
        }

        // Valider le type
        if (type !== 'COURS' && type !== 'TP') {
            throw new Error('Invalid type: must be "COURS" or "TP"');
        }

        // Vérifier que la classe existe
        const classAsBytes = await ctx.stub.getState(classId);
        if (!classAsBytes || classAsBytes.length === 0) {
            throw new Error(`Class ${classId} does not exist`);
        }

        const classData = JSON.parse(classAsBytes.toString());
        if (classData.docType !== 'class') {
            throw new Error(`${classId} is not a valid class`);
        }

        // Vérifier que le support n'existe pas déjà
        const exists = await ctx.stub.getState(materialId);
        if (exists && exists.length > 0) {
            throw new Error(`Material ${materialId} already exists`);
        }

        // Récupérer l'identité de l'uploader
        const uploadedBy = this._getCallerIdentity(ctx);

        // Créer l'objet matériel
        const material = {
            docType: 'material',
            id: materialId,
            classId: classId,
            moduleId: moduleId,
            title: title,
            type: type,
            ipfsHash: ipfsHash,
            uploadedBy: uploadedBy,
            uploadedAt: new Date().toISOString(),
        };

        // Stocker dans le ledger
        await ctx.stub.putState(materialId, Buffer.from(JSON.stringify(material)));

        // Émettre un événement
        ctx.stub.setEvent('MaterialUploaded', Buffer.from(JSON.stringify({
            materialId: materialId,
            classId: classId,
            title: title,
            type: type,
            uploadedBy: uploadedBy,
        })));

        console.info(`✅ Material uploaded: ${materialId} by ${uploadedBy} for class ${classId}`);
        console.info('============= END : UploadCourseMaterial ===========');

        return materialId;
    }

    /**
     * 2. Obtenir tous les supports d'une classe
     *
     * RÈGLE CRITIQUE: Vérifie que l'appelant est inscrit dans la classe
     *
     * Accessible par: Étudiants inscrits + Teachers
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} classId - ID de la classe
     * @returns {string} JSON array des supports
     */
    async GetCourseMaterials(ctx, classId) {
        console.info('============= START : GetCourseMaterials ===========');

        // CONTRÔLE D'ACCÈS: Vérifier l'enrollment
        await this._checkEnrollment(ctx, classId);

        const allResults = [];

        // Récupérer tous les états du ledger
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();

        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;

            try {
                record = JSON.parse(strValue);

                // Filtrer les matériaux de cette classe uniquement
                if (record.docType === 'material' && record.classId === classId) {
                    allResults.push({
                        id: record.id,
                        classId: record.classId,
                        moduleId: record.moduleId,
                        title: record.title,
                        type: record.type,
                        uploadedBy: record.uploadedBy,
                        uploadedAt: record.uploadedAt,
                        // ipfsHash exclu pour des raisons de sécurité (utiliser GetMaterialFile)
                    });
                }
            } catch (err) {
                console.log('Error parsing record:', err);
            }

            result = await iterator.next();
        }

        await iterator.close();

        const caller = this._getCallerIdentity(ctx);
        console.info(`✅ Retrieved ${allResults.length} materials for class ${classId} by ${caller}`);
        console.info('============= END : GetCourseMaterials ===========');

        return JSON.stringify(allResults);
    }

    /**
     * 3. Obtenir le hash IPFS d'un support pour téléchargement
     *
     * Vérifie l'enrollment avant de retourner le hash
     *
     * Accessible par: Étudiants inscrits + Teachers
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} materialId - ID du support
     * @returns {string} JSON contenant l'ipfsHash
     */
    async GetMaterialFile(ctx, materialId) {
        console.info('============= START : GetMaterialFile ===========');

        // Récupérer le matériel
        const materialAsBytes = await ctx.stub.getState(materialId);
        if (!materialAsBytes || materialAsBytes.length === 0) {
            throw new Error(`Material ${materialId} does not exist`);
        }

        const material = JSON.parse(materialAsBytes.toString());

        // Vérifier que c'est bien un matériel
        if (material.docType !== 'material') {
            throw new Error(`${materialId} is not a material`);
        }

        // CONTRÔLE D'ACCÈS: Vérifier l'enrollment dans la classe du matériel
        await this._checkEnrollment(ctx, material.classId);

        const caller = this._getCallerIdentity(ctx);
        console.info(`✅ Material file accessed: ${materialId} by ${caller}`);
        console.info('============= END : GetMaterialFile ===========');

        // Retourner le hash IPFS et les métadonnées
        return JSON.stringify({
            id: material.id,
            title: material.title,
            type: material.type,
            ipfsHash: material.ipfsHash,
            classId: material.classId,
            moduleId: material.moduleId,
        });
    }

    // ==================== FONCTIONS UTILITAIRES BONUS ====================

    /**
     * Obtenir un matériel spécifique (métadonnées uniquement)
     * Accessible par: Teachers uniquement
     */
    async GetMaterial(ctx, materialId) {
        console.info('============= START : GetMaterial ===========');

        if (!this._isSchoolMember(ctx)) {
            throw new Error('Access Denied: Only teachers can view material details');
        }

        const materialAsBytes = await ctx.stub.getState(materialId);
        if (!materialAsBytes || materialAsBytes.length === 0) {
            throw new Error(`Material ${materialId} does not exist`);
        }

        const material = JSON.parse(materialAsBytes.toString());

        if (material.docType !== 'material') {
            throw new Error(`${materialId} is not a material`);
        }

        console.info(`✅ Material retrieved: ${materialId}`);
        console.info('============= END : GetMaterial ===========');

        return JSON.stringify(material);
    }

    /**
     * Supprimer un matériel
     * Accessible par: Teachers uniquement
     */
    async DeleteMaterial(ctx, materialId) {
        console.info('============= START : DeleteMaterial ===========');

        if (!this._isSchoolMember(ctx)) {
            throw new Error('Access Denied: Only teachers can delete materials');
        }

        const materialAsBytes = await ctx.stub.getState(materialId);
        if (!materialAsBytes || materialAsBytes.length === 0) {
            throw new Error(`Material ${materialId} does not exist`);
        }

        const material = JSON.parse(materialAsBytes.toString());

        if (material.docType !== 'material') {
            throw new Error(`${materialId} is not a material`);
        }

        // Supprimer du ledger
        await ctx.stub.deleteState(materialId);

        const caller = this._getCallerIdentity(ctx);

        // Émettre un événement
        ctx.stub.setEvent('MaterialDeleted', Buffer.from(JSON.stringify({
            materialId: materialId,
            classId: material.classId,
            deletedBy: caller,
        })));

        console.info(`✅ Material deleted: ${materialId} by ${caller}`);
        console.info('============= END : DeleteMaterial ===========');

        return JSON.stringify({
            success: true,
            message: `Material ${materialId} successfully deleted`,
        });
    }
}

module.exports = MaterialContract;
