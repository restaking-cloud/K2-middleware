const _ = require('lodash');
const axios = require('axios');
const {ethers} = require('ethers');
const R = require('@blockswaplab/rpbs-self-attestation');

const { utf8ToHex } = require('./services/utils');
const { deserialiseRPBSSelfAttestation } = require('./services/rpbs');
const { getKSquaredLending } = require('./services/contracts');
const {
    getProvider,
    getCurrentBlockNumber,
    getSigningWallet,
    signSlashingReport
} = require('./services/signer');

const {formResponse, formErrorMessage} = require('./response-utils');

const {
    VERSION,                                // Only serve payloads from this version
    DEFAULT_SERVICE_PROVIDER_BORROW_ADDRESS,// Multiple SBP can elect this designated verifier but this is the original creator
    DESIGNATED_VERIFIER_PRIVATE_KEY,        // Not to be exposed and used for signing slashing requests
    PROVIDER_URL,                           // Execution layer provider URL for checking contract info
    K_SQUARED_LENDING_CONTRACT,             // Slashable lending pool
    K_SQUARED_REPORTER_REGISTRY,            // Registry of registered reporters able to report slashing
    LIVENESS_ENDPOINT,                      // This should be open for reporters to be able to detect liveness events
    CORRUPTION_ENDPOINT,                    // This should have JWT auth with the k squared middleware on the validate endpoint
    IDENTIFIER_GENERATOR_ENDPOINT,          // This should have JWT auth with the k squared middleware on the generate endpoint
    CHAIN_ID,                               // Chain validity for slashing messages
    REPORT_DEADLINE_LENGTH_IN_ETH_BLOCKS,   // How long after creating slashing messages they stay active before contract will reject submission
    CORRUPTION_VALIDATION_BEARER_TOKEN,
    IDENTIFIER_BEARER_TOKEN
} = process.env;

const EVENT_TYPES = {
    LIVENESS: 'LIVENESS',
    CORRUPTION: 'CORRUPTION'
};

const info = async () => {
    return formResponse(200, {
        VERSION,
        CHAIN_ID,
        DEFAULT_SERVICE_PROVIDER_BORROW_ADDRESS,
        K_SQUARED_LENDING_CONTRACT,
        K_SQUARED_REPORTER_REGISTRY,
        LIVENESS_ENDPOINT,
        REPORT_DEADLINE_LENGTH_IN_ETH_BLOCKS,
    });
}

const report = async (req) => {
    console.log('Request for report verification triggered');

    if (!req.body) {
        return formResponse(500, formErrorMessage('No body'));
    }

    const body = JSON.parse(req.body);
    if (!body.eventType || !body.version || !body.eventData || !body.rpbsSelfAttestation || !body.serviceProviderAddress) {
        return formResponse(500, formErrorMessage('Missing fields in body'));
    }

    const {
        rpbsSelfAttestation,
        eventType,
        version,
        eventData,
        serviceProviderAddress: SERVICE_PROVIDER_BORROW_ADDRESS
    } = body;

    console.log('Event', JSON.stringify({
        rpbsSelfAttestation,
        eventType,
        version,
        eventData
    }));

    if (eventType !== EVENT_TYPES.LIVENESS && eventType !== EVENT_TYPES.CORRUPTION) {
        return formResponse(500, formErrorMessage('Invalid event type'));
    }

    if (!rpbsSelfAttestation.signature || !rpbsSelfAttestation.publicKey || !rpbsSelfAttestation.commonInfo) {
        return formResponse(500, formErrorMessage('Missing RPBS data'));
    }

    if (parseInt(version) !== parseInt(VERSION)) {
        return formResponse(500, formErrorMessage('Invalid version'));
    }

    // Perform RPBS verification on the reporter
    let signature = deserialiseRPBSSelfAttestation(rpbsSelfAttestation);
    const isRPBSValid = R.rpbs.verifySignature(
        R.curveOperations.decodePointInRPBSFormat(rpbsSelfAttestation.publicKey),
        JSON.stringify(rpbsSelfAttestation.commonInfo),
        signature
    );

    if (!isRPBSValid) {
        return formResponse(500, formErrorMessage('Invalid RPBS self attestation'));
    }

    const provider = getProvider(PROVIDER_URL);
    const kSquaredLending = getKSquaredLending(provider, K_SQUARED_LENDING_CONTRACT);
    const debtPosition = await kSquaredLending.getDebtor(SERVICE_PROVIDER_BORROW_ADDRESS);
    if (debtPosition.endTimestamp.toString() === '0') {
        return formResponse(500, formErrorMessage('No debt position'));
    }

    let slashAmount;

    // Start generating the report and then verify the data submitted by the reporter
    const signingWallet = getSigningWallet(DESIGNATED_VERIFIER_PRIVATE_KEY, provider);
    let report = {
        slashType: eventType === EVENT_TYPES.LIVENESS ? '0' : '1',
        debtor: SERVICE_PROVIDER_BORROW_ADDRESS,
        signature: utf8ToHex(Object.keys(rpbsSelfAttestation.signature).map(
            k => rpbsSelfAttestation.signature[k]
        ).join(':'))
    };

    if (eventType === EVENT_TYPES.LIVENESS) {
        if (!eventData || !eventData.query || !eventData.livenessData || !eventData.proposedSlashing) {
            return formResponse(500, formErrorMessage('Invalid event data for liveness'))
        }

        const {
            query,
            livenessData,
            proposedSlashing
        } = eventData;

        if (!rpbsSelfAttestation.commonInfo.livenessData) {
            return formResponse(500, formErrorMessage('Invalid liveness data in RPBS attestation'));
        }

        let livenessResponse;
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
            return formResponse(500, formErrorMessage('Unable to get liveness data'));
        }

        console.log('Liveness response', livenessResponse)
        if (!livenessResponse || !livenessResponse.livenessData || !livenessResponse.severityScore) {
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

        let maxSlashableAmountPerLiveness = debtPosition.maxSlashableAmountPerLiveness;
        slashAmount = (maxSlashableAmountPerLiveness.mul(ethers.BigNumber.from(ethers.utils.parseEther(livenessResponse.severityScore)))).div(ethers.utils.parseEther('1'));
        if (slashAmount.toString() !== proposedSlashing.toString()) {
            return formResponse(500, formErrorMessage(`Invalid slash amount. Expected ${slashAmount} based on ${maxSlashableAmountPerLiveness} max slashing`));
        }

        // fill the final report data
        report = {
            ...report,
            amount: ethers.BigNumber.from(slashAmount.toString())
        }
    } else if (eventType === EVENT_TYPES.CORRUPTION) {
        if (!eventData || !eventData.events || !eventData.proposedSlashing) {
            return formResponse(500, formErrorMessage('Invalid event data for corruption'))
        }

        const {
            events,
            proposedSlashing
        } = eventData;

        if (!rpbsSelfAttestation.commonInfo.events) {
            return formResponse(500, formErrorMessage('No corruption events specified in RPBS'));
        }

        if (!_.isEqual(events, rpbsSelfAttestation.commonInfo.events)) {
            return formResponse(500, formErrorMessage('Event data not consistent with RPBS self attestation'));
        }

        // Corruption events externally validated outside of middleware
        let corruptionResponse;
        try {
            corruptionResponse = (await axios.post(
                CORRUPTION_ENDPOINT,
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
            return formResponse(500, formErrorMessage('Unable to validate corruption events'));
        }
        console.log('Corruption response', corruptionResponse);

        let severityScore = Number(corruptionResponse.severityScore);
        if (isNaN(severityScore) || severityScore <= 0.0 || severityScore > 1.0) {
            return formResponse(500, formErrorMessage('Invalid severity score'));
        }

        let maxSlashableAmountPerCorruption = debtPosition.maxSlashableAmountPerCorruption.toString();
        slashAmount = (maxSlashableAmountPerCorruption.mul(ethers.BigNumber.from(ethers.utils.parseEther(severityScore.toString())))).div(ethers.utils.parseEther('1'));
        if (slashAmount !== Number(proposedSlashing)) {
            return formResponse(500, formErrorMessage(`Invalid slash amount. Expected ${slashAmount} based on ${maxSlashableAmountPerCorruption} max slashing`));
        }

        // fill the final report data
        report = {
            ...report,
            amount: ethers.BigNumber.from(slashAmount.toString())
        };
    }

    let reportIdentifier;
    try {
        reportIdentifier = (await axios.post(
            IDENTIFIER_GENERATOR_ENDPOINT,
            {
                report,
                eventData,
                eventType,
                serviceProviderAddress: SERVICE_PROVIDER_BORROW_ADDRESS
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
            return formResponse(500, formErrorMessage(`Invalid report identifier`));
        }

        reportIdentifier = reportIdentifier.nextIdentifier;
    } catch (e) {
        console.log(`Unable to get a report identifier`, e);
        return formResponse(500, formErrorMessage(`Unable to get a report identifier`));
    }

    console.log('Report will be verified with identifier', reportIdentifier.toString());

    // Sign the report and let the reporter collect their earnings
    const deadline = (await getCurrentBlockNumber(provider)) + parseInt(REPORT_DEADLINE_LENGTH_IN_ETH_BLOCKS);
    const signedSlashingReport = await signSlashingReport(
        signingWallet,
        CHAIN_ID,
        K_SQUARED_REPORTER_REGISTRY,
        {
            ...report,
            block: deadline,
            identifier: Number(reportIdentifier)
        }
    );

    console.log('Signature issued');

    return formResponse(200, {
        inputs: {
            rpbsSelfAttestation,
            eventType,
            version,
            eventData
        },
        signedReport: {
            ...report,
            identifier: Number(reportIdentifier)
        },
        designatedVerifierSignature: {
            deadline,
            v: signedSlashingReport.v,
            r: `0x${Buffer.from(signedSlashingReport.r).toString('hex')}`,
            s: `0x${Buffer.from(signedSlashingReport.s).toString('hex')}`,
        }
    });
}

module.exports = {
    info,
    report
}