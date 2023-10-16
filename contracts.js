const { ethers } = require('ethers');
const KSquaredLendingABI = require('../abis/KSquaredLending.json');
const ReporterRegistryABI = require('../abis/KSquaredReporterRegistry.json');

function getKSquaredLending(provider, contractAddress) {
    return new ethers.Contract(
        contractAddress,
        KSquaredLendingABI,
        provider
    );
}

function getReporterRegistry(provider, contractAddress) {
    return new ethers.Contract(
        contractAddress,
        ReporterRegistryABI,
        provider
    );
}

module.exports = {
    getKSquaredLending,
    getReporterRegistry
}
