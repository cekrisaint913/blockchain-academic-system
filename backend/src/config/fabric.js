

const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

class FabricClient {
    constructor() {
        this.channelName = process.env.CHANNEL_NAME || 'mychannel';
        this.chaincodeName = process.env.CHAINCODE_NAME || 'academic';
        this.walletPath = path.join(__dirname, '../../wallet');
        this.connectionProfilePath = path.resolve(
            __dirname,
            '../../',
            process.env.FABRIC_PATH,
            'organizations/peerOrganizations/org1.example.com/connection-org1.json'
        );
    }

    async getConnectionProfile() {
        const ccpJSON = fs.readFileSync(this.connectionProfilePath, 'utf8');
        return JSON.parse(ccpJSON);
    }

    async getWallet() {
        return await Wallets.newFileSystemWallet(this.walletPath);
    }

    async connectGateway(identity) {
        try {
            const ccp = await this.getConnectionProfile();
            const wallet = await this.getWallet();

            // Vérifier que l'identité existe
            const identityExists = await wallet.get(identity);
            if (!identityExists) {
                throw new Error(`Identity ${identity} does not exist in wallet`);
            }

            const gateway = new Gateway();
            await gateway.connect(ccp, {
                wallet,
                identity: identity,
                discovery: { enabled: true, asLocalhost: true }
            });

            return gateway;
        } catch (error) {
            console.error(`Failed to connect gateway: ${error}`);
            throw error;
        }
    }

    async submitTransaction(identity, functionName, ...args) {
        let gateway;
        try {
            gateway = await this.connectGateway(identity);
            const network = await gateway.getNetwork(this.channelName);
            const contract = network.getContract(this.chaincodeName);

            const result = await contract.submitTransaction(functionName, ...args);
            return JSON.parse(result.toString());
        } catch (error) {
            console.error(`Transaction failed: ${error}`);
            throw error;
        } finally {
            if (gateway) {
                gateway.disconnect();
            }
        }
    }

    async evaluateTransaction(identity, functionName, ...args) {
        let gateway;
        try {
            gateway = await this.connectGateway(identity);
            const network = await gateway.getNetwork(this.channelName);
            const contract = network.getContract(this.chaincodeName);

            const result = await contract.evaluateTransaction(functionName, ...args);
            return JSON.parse(result.toString());
        } catch (error) {
            console.error(`Query failed: ${error}`);
            throw error;
        } finally {
            if (gateway) {
                gateway.disconnect();
            }
        }
    }
}

module.exports = new FabricClient();
