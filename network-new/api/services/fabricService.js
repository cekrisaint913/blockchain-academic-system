/*
 * Fabric Service - Gestion de la connexion à Hyperledger Fabric
 *
 * Responsabilités:
 * - Connexion au réseau Fabric via Gateway
 * - Gestion du wallet d'identités
 * - Soumission de transactions (invoke)
 * - Évaluation de requêtes (query)
 */

'use strict';

const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

class FabricService {

    /**
     * Connexion au réseau Fabric
     *
     * @param {string} userId - ID de l'utilisateur (ex: "student1@students.academic.edu")
     * @param {string} orgMSP - Organisation MSP ("SchoolMSP" ou "StudentsMSP")
     * @returns {Promise<{gateway: Gateway, contract: Contract}>}
     */
    async connect(userId, orgMSP = 'SchoolMSP') {
        try {
            // Charger le connection profile
            const ccpPath = path.resolve(__dirname, '../config/connection-profile.json');

            if (!fs.existsSync(ccpPath)) {
                throw new Error(`Connection profile not found at ${ccpPath}`);
            }

            const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

            // Créer le wallet
            const walletPath = path.join(__dirname, '../config/wallet');
            const wallet = await Wallets.newFileSystemWallet(walletPath);

            // Vérifier que l'identité existe
            const identity = await wallet.get(userId);
            if (!identity) {
                throw new Error(`Identity "${userId}" not found in wallet. Please enroll first.`);
            }

            console.log(`✅ Identity found: ${userId} (${orgMSP})`);

            // Créer la gateway
            const gateway = new Gateway();

            // Options de connexion
            const connectionOptions = {
                wallet,
                identity: userId,
                discovery: {
                    enabled: true,
                    asLocalhost: true
                }
            };

            // Se connecter à la gateway
            await gateway.connect(ccp, connectionOptions);

            console.log(`✅ Connected to Fabric gateway`);

            // Récupérer le network (channel)
            const network = await gateway.getNetwork('academic-channel');
            console.log(`✅ Connected to channel: academic-channel`);

            // Récupérer le contract (chaincode)
            const contract = network.getContract('academic-cc');
            console.log(`✅ Got contract: academic-cc`);

            return { gateway, contract, network };

        } catch (error) {
            console.error(`❌ Failed to connect to Fabric: ${error.message}`);
            throw error;
        }
    }

    /**
     * Déconnexion du réseau Fabric
     *
     * @param {Gateway} gateway - Gateway Fabric à déconnecter
     */
    async disconnect(gateway) {
        if (gateway) {
            await gateway.disconnect();
            console.log('✅ Gateway disconnected');
        }
    }

    /**
     * Soumettre une transaction (invoke)
     * Modifie l'état du ledger
     *
     * @param {string} userId - ID de l'utilisateur
     * @param {string} orgMSP - Organisation MSP
     * @param {string} contractName - Nom du contrat (ex: "ClassContract")
     * @param {string} functionName - Nom de la fonction (ex: "CreateClass")
     * @param {Array<string>} args - Arguments de la fonction
     * @returns {Promise<any>} Résultat de la transaction
     */
    async submitTransaction(userId, orgMSP, contractName, functionName, ...args) {
        let gateway;

        try {
            const { gateway: gw, contract } = await this.connect(userId, orgMSP);
            gateway = gw;

            const fullFunctionName = `${contractName}:${functionName}`;
            console.log(`📤 Submitting transaction: ${fullFunctionName}(${args.join(', ')})`);

            const result = await contract.submitTransaction(fullFunctionName, ...args);

            console.log(`✅ Transaction submitted successfully`);

            // Parser le résultat si c'est du JSON
            try {
                return JSON.parse(result.toString());
            } catch {
                return result.toString();
            }

        } catch (error) {
            console.error(`❌ Transaction failed: ${error.message}`);
            throw error;
        } finally {
            if (gateway) {
                await this.disconnect(gateway);
            }
        }
    }

    /**
     * Évaluer une transaction (query)
     * Ne modifie pas l'état du ledger
     *
     * @param {string} userId - ID de l'utilisateur
     * @param {string} orgMSP - Organisation MSP
     * @param {string} contractName - Nom du contrat
     * @param {string} functionName - Nom de la fonction
     * @param {Array<string>} args - Arguments de la fonction
     * @returns {Promise<any>} Résultat de la requête
     */
    async evaluateTransaction(userId, orgMSP, contractName, functionName, ...args) {
        let gateway;

        try {
            const { gateway: gw, contract } = await this.connect(userId, orgMSP);
            gateway = gw;

            const fullFunctionName = `${contractName}:${functionName}`;
            console.log(`📥 Evaluating transaction: ${fullFunctionName}(${args.join(', ')})`);

            const result = await contract.evaluateTransaction(fullFunctionName, ...args);

            console.log(`✅ Transaction evaluated successfully`);

            // Parser le résultat si c'est du JSON
            try {
                return JSON.parse(result.toString());
            } catch {
                return result.toString();
            }

        } catch (error) {
            console.error(`❌ Evaluation failed: ${error.message}`);
            throw error;
        } finally {
            if (gateway) {
                await this.disconnect(gateway);
            }
        }
    }

    /**
     * Vérifier si une identité existe dans le wallet
     *
     * @param {string} userId - ID de l'utilisateur
     * @returns {Promise<boolean>}
     */
    async identityExists(userId) {
        try {
            const walletPath = path.join(__dirname, '../config/wallet');
            const wallet = await Wallets.newFileSystemWallet(walletPath);
            const identity = await wallet.get(userId);
            return !!identity;
        } catch (error) {
            console.error(`Error checking identity: ${error.message}`);
            return false;
        }
    }

    /**
     * Lister toutes les identités dans le wallet
     *
     * @returns {Promise<Array<string>>}
     */
    async listIdentities() {
        try {
            const walletPath = path.join(__dirname, '../config/wallet');
            const wallet = await Wallets.newFileSystemWallet(walletPath);
            const identities = await wallet.list();
            return identities.map(id => id.label);
        } catch (error) {
            console.error(`Error listing identities: ${error.message}`);
            return [];
        }
    }
}

module.exports = new FabricService();
