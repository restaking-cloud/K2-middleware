const {ethers} = require('ethers');
const {getProvider} = require('./Provider');

const getK2Lending = (providerUrl, address) => {
    return new ethers.Contract(
        address,
        require('../abis/K2Lending.json'),
        getProvider(providerUrl)
    );
}

module.exports = {
    getK2Lending
}