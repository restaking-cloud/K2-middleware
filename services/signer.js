const { ethers, utils } = require('ethers');
const Web3 = require("web3");
const { getReporterRegistry } = require('../services/contracts');
const { ecsign } = require('ethereumjs-util');

const ReportTypes = [
    {name: 'slashType', type: 'uint8'},
    {name: 'debtor', type: 'address'},
    {name: 'amount', type: 'uint256'},
    {name: 'identifier', type: 'uint256'},
    {name: 'block', type: 'uint256'},
    {name: 'signature', type: 'bytes'}
];

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

    // TODO - clean up
    // // Sign the typed data
    // const signature = await signer._signTypedData({
    //     name: 'KSquaredReporterRegistry',
    //     version: '1',
    //     chainId,
    //     verifyingContract
    // }, { ReportTypes }, report);

    // From the typed data compute the v, r and s that needs to be returned
    //const {v, r, s} = utils.splitSignature(signature);

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