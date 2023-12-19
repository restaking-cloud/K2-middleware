const { readEnv } = require('./environment');
const { EVENT_TYPES } = require('../constants');

const validateBodyFromRequest = (req) => {
    if (!req.body) return formResponse(500, formErrorMessage('No body'));
    
    let body;
    try {
        body = JSON.parse(req.body);
        if (!body.eventType || !body.version || !body.eventData || !body.rpbsSelfAttestation || !body.serviceProviderAddress) {
            return formResponse(500, formErrorMessage('Missing fields in body'));
        }
    } catch(_) {
        return formResponse(500, formErrorMessage('Error parsing body via JSON.parse'));
    }
}

const validateEvent = (eventType, rpbsSelfAttestation, version) => {
    const {
        VERSION,
    } = readEnv();

    if (eventType !== EVENT_TYPES.LIVENESS && eventType !== EVENT_TYPES.CORRUPTION) {
        return formResponse(500, formErrorMessage('Invalid event type'));
    }

    if (!rpbsSelfAttestation.signature || !rpbsSelfAttestation.publicKey || !rpbsSelfAttestation.commonInfo) {
        return formResponse(500, formErrorMessage('Missing RPBS data'));
    }

    if (parseInt(version) !== parseInt(VERSION)) {
        return formResponse(500, formErrorMessage('Invalid version'));
    }
}

module.exports = {
    validateBodyFromRequest,
    validateEvent
}