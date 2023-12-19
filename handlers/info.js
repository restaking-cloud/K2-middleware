const { readEnv } = require('../services/environment');
const { formResponse } = require('../response-utils');

const infoHandler = async () => {
    const {
        VERSION,
        CHAIN_ID,
        DEFAULT_SERVICE_PROVIDER_BORROW_ADDRESS,
        K_SQUARED_LENDING_CONTRACT,
        K_SQUARED_REPORTER_REGISTRY,
        LIVENESS_ENDPOINT,
        REPORT_DEADLINE_LENGTH_IN_ETH_BLOCKS,
        DATA_FEED_ENDPOINT,
    } = readEnv();

    return formResponse(200, {
        VERSION,
        CHAIN_ID,
        DEFAULT_SERVICE_PROVIDER_BORROW_ADDRESS,
        K_SQUARED_LENDING_CONTRACT,
        K_SQUARED_REPORTER_REGISTRY,
        LIVENESS_ENDPOINT,
        REPORT_DEADLINE_LENGTH_IN_ETH_BLOCKS,
        DATA_FEED_ENDPOINT,
    });
}

module.exports = {
    infoHandler
}