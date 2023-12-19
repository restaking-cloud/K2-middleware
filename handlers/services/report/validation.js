const _ = require('lodash');
const { formResponse, formErrorMessage } = require('../../../response-utils');

const livenessDataValidation = (eventData, rpbsSelfAttestation) => {
    if (
        !eventData 
        || !eventData.query 
        || !eventData.livenessData 
        || !eventData.proposedSlashing
    ) {
        return formResponse(500, formErrorMessage('Invalid event data for liveness'));
    }

    if (!rpbsSelfAttestation.commonInfo.livenessData) {
        return formResponse(500, formErrorMessage('Invalid liveness data in RPBS attestation'));
    }
}

const livenessResponseValidation = (livenessResponse, livenessData, rpbsSelfAttestation) => {
    if (
        !livenessResponse 
        || !livenessResponse.livenessData 
        || !livenessResponse.severityScore
    ) {
        return formResponse(500, formErrorMessage('Invalid liveness response from service provider - try again later'));
    }

    let severityScore = Number(livenessResponse.severityScore);
    if (isNaN(severityScore) || severityScore <= 0.0 || severityScore > 1.0) {
        return formResponse(500, formErrorMessage('Invalid severity score'));
    }

    if (!_.isEqual(livenessResponse.livenessData, livenessData)) {
        return formResponse(500, formErrorMessage('Invalid liveness data versus liveness endpoint'));
    }

    if (!_.isEqual(livenessResponse.livenessData, rpbsSelfAttestation.commonInfo.livenessData)) {
        return formResponse(500, formErrorMessage('Invalid liveness data versus RPBS'));
    }
}

const corruptionDataValidation = (eventData, rpbsSelfAttestation) => {
    if (
        !eventData 
        || !eventData.events 
        || !eventData.proposedSlashing
    ) {
        return formResponse(500, formErrorMessage('Invalid event data for corruption'))
    }

    if (!rpbsSelfAttestation.commonInfo.events) {
        return formResponse(500, formErrorMessage('No corruption events specified in RPBS'));
    }

    if (!_.isEqual(eventData.events, rpbsSelfAttestation.commonInfo.events)) {
        return formResponse(500, formErrorMessage('Event data not consistent with RPBS self attestation'));
    }
}

module.exports = {
    livenessDataValidation,
    livenessResponseValidation,
    corruptionDataValidation,
}