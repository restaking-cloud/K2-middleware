const Web3 = require("web3");
const { ethers } = require('ethers');

const getProvider = providerUrl => new ethers.providers.Web3Provider(new Web3.providers.HttpProvider(providerUrl));

module.exports = {
    getProvider
}