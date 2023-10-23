const {formResponse, formErrorMessage} = require('./response-utils');
const {getNonceManager} = require("./services/NonceManager");

const {
    PROVIDER_URL,
    NONCE_MANAGER_ADDRESS
} = process.env;

const EVENT_TYPES = {
    LIVENESS: 'LIVENESS',
    CORRUPTION: 'CORRUPTION'
};

/// @dev Service provider infrastructure should have some way of generating report identifiers to distinguish events in a way that the contracts will not allow reporting the same event twice
const nextIdentifier = async (req) => {
    const body = JSON.parse(req.body);
    if (!body) {
        return formResponse(500, formErrorMessage('Missing body'));
    }

    if (!body.report || !body.eventData || !body.eventType) {
        return formResponse(500, formErrorMessage('Invalid body data'));
    }

    // Here any kind of additional checks can be performed. Assume that the report has been validated at this point (by the middleware) as is about to be signed with the nonce

    // Here an on-chain source of nonces are used. See NonceManager.sol from the K2 smart contract suite for the behaviour of this contract
    const nonceManager = getNonceManager(PROVIDER_URL, NONCE_MANAGER_ADDRESS)
    let nextIdentifier;
    if (body.eventType === EVENT_TYPES.LIVENESS) {
        nextIdentifier = (await nonceManager.livenessNonce()).toString()
    } else {
        nextIdentifier = (await nonceManager.corruptionNonce()).toString()
    }

    return formResponse(200, { nextIdentifier });
}

module.exports = {
    nextIdentifier
}