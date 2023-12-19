const axios = require('axios');
const { formResponse, formErrorMessage } = require('../../../response-utils');
const { readEnv } = require('../../../services/environment');

const fetchLivenessInfo = async (query) => {
    let livenessResponse;
    let error;

    if (!query || query.indexOf('?') === -1) {
        return formResponse(500, formErrorMessage('Invalid liveness query'));
    }

    const { LIVENESS_ENDPOINT } = readEnv();

    try {
        livenessResponse = (await axios.get(
            `${LIVENESS_ENDPOINT}${query}`,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            }
        )).data;
    } catch (e) {
        error = formResponse(500, formErrorMessage('Unable to get liveness data'));
    }

    return {
        livenessResponse,
        error
    }
}

const verifyCorruptionEvents = async (events) => {
    let corruptionResponse;
    let error;

    const { CORRUPTION_VERIFICATION_ENDPOINT, CORRUPTION_VALIDATION_BEARER_TOKEN } = readEnv();

    try {
        corruptionResponse = (await axios.post(
            CORRUPTION_VERIFICATION_ENDPOINT,
            JSON.stringify({events}),
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Authorization': `Bearer ${CORRUPTION_VALIDATION_BEARER_TOKEN}`
                }
            }
        )).data;
    } catch (e) {
        error = formResponse(500, formErrorMessage('Unable to validate corruption events'));
    }
    
    return {
        corruptionResponse,
        error
    }
}

const generateReportIdentifier = async (report, eventData, eventType, serviceProviderAddress) => {
    const { IDENTIFIER_GENERATOR_ENDPOINT, IDENTIFIER_BEARER_TOKEN } = readEnv();

    let reportIdentifier;
    let error;

    try {
        reportIdentifier = (await axios.post(
            IDENTIFIER_GENERATOR_ENDPOINT,
            {
                report,
                eventData,
                eventType,
                serviceProviderAddress
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Authorization': `Bearer ${IDENTIFIER_BEARER_TOKEN}`
                }
            }
        )).data

        if (!reportIdentifier || !reportIdentifier.nextIdentifier) {
            error = formResponse(500, formErrorMessage(`Invalid report identifier`));
        }

        reportIdentifier = reportIdentifier.nextIdentifier;
    } catch (e) {
        console.log(`Unable to get a report identifier from ${IDENTIFIER_GENERATOR_ENDPOINT}`, e);
        error = formResponse(500, formErrorMessage(`Unable to get a report identifier`));
    }

    return {
        reportIdentifier,
        error
    }
}

module.exports = {
    fetchLivenessInfo,
    verifyCorruptionEvents,
    generateReportIdentifier,
}