

const { create } = require('ipfs-http-client');
const logger = require('../utils/logger');
const fs = require('fs');

class IPFSService {
    constructor() {
        this.client = null;
        this.initClient();
    }

    initClient() {
        try {
            // IPFS optionnel - si non disponible, on continue sans
            this.client = create({
                host: process.env.IPFS_HOST || 'localhost',
                port: process.env.IPFS_PORT || 5001,
                protocol: process.env.IPFS_PROTOCOL || 'http'
            });
            logger.info('IPFS client initialized');
        } catch (error) {
            logger.warn(`IPFS not available: ${error.message}`);
            logger.warn('Application will work without IPFS (using demo hashes)');
            this.client = null;
        }
    }

    async uploadFile(filePath) {
        try {
            if (!this.client) {
                // Mode démo sans IPFS
                const stats = fs.statSync(filePath);
                return {
                    hash: 'QmDEMO' + Date.now(),
                    size: stats.size
                };
            }

            const file = fs.readFileSync(filePath);
            const result = await this.client.add(file);

            logger.info(`File uploaded to IPFS: ${result.path}`);

            return {
                hash: result.path,
                size: result.size
            };
        } catch (error) {
            logger.error(`IPFS upload failed: ${error.message}`);
            // Fallback sur mode démo
            return {
                hash: 'QmDEMO' + Date.now(),
                size: 0
            };
        }
    }

    async uploadContent(content) {
        try {
            if (!this.client) {
                return {
                    hash: 'QmDEMO' + Date.now(),
                    size: content.length
                };
            }

            const result = await this.client.add(content);
            logger.info(`Content uploaded to IPFS: ${result.path}`);

            return {
                hash: result.path,
                size: result.size
            };
        } catch (error) {
            logger.error(`IPFS upload failed: ${error.message}`);
            return {
                hash: 'QmDEMO' + Date.now(),
                size: content.length
            };
        }
    }

    async getFile(hash) {
        try {
            if (!this.client) {
                throw new Error('IPFS not available in demo mode');
            }

            const chunks = [];
            for await (const chunk of this.client.cat(hash)) {
                chunks.push(chunk);
            }

            logger.info(`File retrieved from IPFS: ${hash}`);
            return Buffer.concat(chunks);
        } catch (error) {
            logger.error(`IPFS retrieval failed: ${error.message}`);
            throw error;
        }
    }

    async isAvailable() {
        if (!this.client) return false;
        
        try {
            await this.client.id();
            return true;
        } catch (error) {
            return false;
        }
    }

    async pinFile(hash) {
        try {
            if (!this.client) {
                logger.warn('IPFS not available, cannot pin file');
                return false;
            }

            await this.client.pin.add(hash);
            logger.info(`File pinned: ${hash}`);
            return true;
        } catch (error) {
            logger.error(`IPFS pin failed: ${error.message}`);
            return false;
        }
    }
}

module.exports = new IPFSService();
