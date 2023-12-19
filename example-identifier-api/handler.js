const { formResponse, formErrorMessage } = require('./response-utils');
const { getNonceManager } = require("./services/NonceManager");
const { getK2Lending } = require("./services/K2Lending");

const {
    PROVIDER_URL,
    K2_LENDING_ADDRESS,
    BEARER_TOKEN
} = process.env;

const EVENT_TYPES = {
    LIVENESS: 'LIVENESS',
    CORRUPTION: 'CORRUPTION'
};

/// @dev Service provider infrastructure should have some way of generating report identifiers to distinguish events in a way that the contracts will not allow reporting the same event twice
const nextIdentifier = async (req) => {
    // Ensure that only those with the correct bearer can access
    const headers = req.headers;
    if (!headers || !headers.Authorization || headers.Authorization !== `Bearer ${BEARER_TOKEN}`) {
        return formResponse(500, formErrorMessage('Invalid bearer token'));
    }

    // Check that there is a body
    const body = JSON.parse(req.body);
    if (!body) return formResponse(500, formErrorMessage('Missing body'));

    // Check the body is valid
    if (!body.report || !body.eventData || !body.eventType || !body.serviceProviderAddress) {
        return formResponse(500, formErrorMessage('Invalid body data'));
    }

    // Here any kind of additional checks can be performed. Assume that the report has been validated at this point (by the middleware) as is about to be signed with the nonce
    // Checks can be done on event data, type, service provider address etc

    // On-chain source of nonces can be used. See NonceManager.sol from the K2 smart contract suite for the behaviour of this contract
    let k2 = getK2Lending(PROVIDER_URL, K2_LENDING_ADDRESS)
    let nextIdentifier = parseInt(new Date() / 1000).toString();
    let debtor = await k2.getDebtor(body.serviceProviderAddress)
    if (debtor.hook !== '0x0000000000000000000000000000000000000000') {
        const nonceManager = getNonceManager(PROVIDER_URL, debtor.hook)
        if (body.eventType === EVENT_TYPES.LIVENESS) {
            nextIdentifier = (await nonceManager.livenessNonce()).toString()
        } else {
            nextIdentifier = (await nonceManager.corruptionNonce()).toString()
        }
    }

    return formResponse(200, { nextIdentifier });
}

module.exports = {
    nextIdentifier
}