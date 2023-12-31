const {ethers} = require('ethers');
const {getProvider} = require('./Provider');

const getNonceManager = (providerUrl, address) => {
    return new ethers.Contract(
        address,
        require('../abis/NonceManager.json'),
        getProvider(providerUrl)
    );
}

module.exports = {
    getNonceManager
}