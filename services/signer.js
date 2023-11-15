const { ethers } = require('ethers');
const Web3 = require("web3");
const { getReporterRegistry } = require('../services/contracts');
const { ecsign } = require('ethereumjs-util');

const getCurrentBlockNumber = async provider => provider.getBlockNumber()

const getProvider = providerUrl => new ethers.providers.Web3Provider(new Web3.providers.HttpProvider(providerUrl));

const signSlashingReport = async (signer, chainId, verifyingContract, report) => {
    console.log('Report being signed', report);

    const reporterRegistry = getReporterRegistry(signer, verifyingContract);
    let unsignedReportHash;
    try {
        unsignedReportHash = await reporterRegistry.reportTypedHash(report);
        console.log('unsignedReportHash', unsignedReportHash)
    } catch (e) {
        throw new Error(`Unable to get report hash`)
    }

    let { v, r, s } = ecsign(
        Buffer.from(unsignedReportHash.slice(2), 'hex'),
        Buffer.from(signer.privateKey.slice(2), 'hex')
    );

    return {v, r, s};
}

const getSigningWallet = (privateKey, provider) => {
    return new ethers.Wallet(
        privateKey,
        provider
    );
}

module.exports = {
    getProvider,
    getCurrentBlockNumber,
    getSigningWallet,
    signSlashingReport
}