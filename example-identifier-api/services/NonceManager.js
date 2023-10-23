const {ethers} = require('ethers');
const Web3 = require("web3");

const getProvider = providerUrl => new ethers.providers.Web3Provider(new Web3.providers.HttpProvider(providerUrl));

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