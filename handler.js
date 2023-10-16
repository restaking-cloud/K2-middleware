const _ = require('lodash');
const axios = require('axios');
const BN = require("bn.js");
const {ethers} = require('ethers');

const {
    getKSquaredLending
} = require('./services/contracts');

const {
    getProvider,
    getCurrentBlockNumber,
    getSigningWallet,
    signSlashingReport
} = require('./services/signer');

const R = require('@blockswaplab/rpbs-self-attestation');

const {formResponse, formErrorMessage} = require('./response-utils');

const {
    VERSION,
    SERVICE_PROVIDER_BORROW_ADDRESS,
    DESIGNATED_VERIFIER_PRIVATE_KEY,
    PROVIDER_URL,
    K_SQUARED_LENDING_CONTRACT,
    K_SQUARED_REPORTER_REGISTRY,
    LIVENESS_ENDPOINT,                      // This should be open for reporters to be able to detect liveness events
    CORRUPTION_ENDPOINT,                    // This should have JWT auth with the k squared middleware on the validate endpoint
    IDENTIFIER_GENERATOR_ENDPOINT,          // This should have JWT auth with the k squared middleware on the generate endpoint
    CHAIN_ID,
    REPORT_DEADLINE_LENGTH_IN_ETH_BLOCKS,
} = process.env;

const EVENT_TYPES = {
    LIVENESS: 'LIVENESS',
    CORRUPTION: 'CORRUPTION'
};

function utf8ToHex(str) {
    return '0x' + Array.from(str).map(c =>
        c.charCodeAt(0) < 128 ? c.charCodeAt(0).toString(16) :
            encodeURIComponent(c).replace(/\%/g,'').toLowerCase()
    ).join('');
}

const info = async () => {
    return formResponse(200, {
        VERSION,
        CHAIN_ID,
        SERVICE_PROVIDER_BORROW_ADDRESS,
        K_SQUARED_LENDING_CONTRACT,
        K_SQUARED_REPORTER_REGISTRY,
        LIVENESS_ENDPOINT,
        REPORT_DEADLINE_LENGTH_IN_ETH_BLOCKS,
    });
}

const report = async (req) => {
    console.log('Request for report verification triggered');

    const body = JSON.parse(req.body);
    if (!body) {
        return formResponse(500, formErrorMessage('No body'));
    }

    const {
        rpbsSelfAttestation,
        eventType,
        version,
        eventData
    } = body;

    console.log('Event', {
        rpbsSelfAttestation,
        eventType,
        version,
        eventData
    });

    if (!eventType || !version || !eventData || !rpbsSelfAttestation) {
        return formResponse(500, formErrorMessage('Missing fields in body'));
    }

    if (!rpbsSelfAttestation.signature || !rpbsSelfAttestation.publicKey || !rpbsSelfAttestation.commonInfo) {
        return formResponse(500, formErrorMessage('Missing RPBS data'));
    }

    if (eventType !== EVENT_TYPES.LIVENESS && eventType !== EVENT_TYPES.CORRUPTION) {
        return formResponse(500, formErrorMessage('Invalid event type'));
    }

    if (parseInt(version) !== parseInt(VERSION)) {
        return formResponse(500, formErrorMessage('Invalid version'));
    }

    // Perform RPBS verification on the reporter
    let signature = Object.assign({}, rpbsSelfAttestation.signature);
    signature.z1Hat = R.curveOperations.decodePointInRPBSFormat(
        signature.z1Hat
    );
    signature.c1Hat = R.curveOperations.reduceHexToGroup(
        new BN(signature.c1Hat, 16)
    );
    signature.s1Hat = R.curveOperations.reduceHexToGroup(
        new BN(signature.s1Hat, 16)
    );
    signature.c2Hat = R.curveOperations.reduceHexToGroup(
        new BN(signature.c2Hat, 16)
    );
    signature.s2Hat = R.curveOperations.reduceHexToGroup(
        new BN(signature.s2Hat, 16)
    );
    signature.m1Hat = R.curveOperations.decodePointInRPBSFormat(
        signature.m1Hat
    );

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
    const deadline = (await getCurrentBlockNumber(provider)) + parseInt(REPORT_DEADLINE_LENGTH_IN_ETH_BLOCKS);
    let report = {
        slashType: eventType === EVENT_TYPES.LIVENESS ? '0' : '1',
        debtor: SERVICE_PROVIDER_BORROW_ADDRESS,
        block: deadline,
        signature: utf8ToHex(Object.keys(rpbsSelfAttestation.signature).map(
            k => rpbsSelfAttestation.signature[k]
        ).join(':'))
    };

    if (eventType === EVENT_TYPES.LIVENESS) {
        const {
            numOfValidatorsOnline,
            numOfValidatorsOffline,
            totalValidators,
            proposedSlashing
        } = eventData;

        if (!rpbsSelfAttestation.commonInfo.numOfValidatorsOnline ||
            !rpbsSelfAttestation.commonInfo.numOfValidatorsOffline ||
            !rpbsSelfAttestation.commonInfo.totalValidators
        ) {
            return formResponse(500, formErrorMessage('Invalid liveness data in RPBS attestation'));
        }

        let livenessData;
        try {
            livenessData = (await axios.get(
                `${LIVENESS_ENDPOINT}`,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                }
            )).data; // ERROR handling
        } catch (e) {
            return formResponse(500, formErrorMessage('Unable to get liveness data'));
        }
        console.log('Liveness Data', livenessData)

        if (Number(numOfValidatorsOnline) + Number(numOfValidatorsOffline) !== Number(totalValidators)) {
            return formResponse(500, formErrorMessage('Sum of online + offline invalid'));
        }

        if (numOfValidatorsOnline !== livenessData.numOfValidatorsOnline ||
            numOfValidatorsOnline !== rpbsSelfAttestation.commonInfo.numOfValidatorsOnline) {
            return formResponse(500, formErrorMessage('Num of online validators invalid'));
        }

        if (numOfValidatorsOffline !== livenessData.numOfValidatorsOffline ||
            numOfValidatorsOffline !== rpbsSelfAttestation.commonInfo.numOfValidatorsOffline) {
            return formResponse(500, formErrorMessage('Num of offline validators invalid'));
        }

        if (totalValidators !== livenessData.totalValidators ||
            totalValidators !== rpbsSelfAttestation.commonInfo.totalValidators) {
            return formResponse(500, formErrorMessage('Num of total validators invalid'));
        }

        let percentageOfValidatorsOnline = Number(livenessData.numOfValidatorsOffline) / Number(livenessData.totalValidators);
        if (isNaN(percentageOfValidatorsOnline) || percentageOfValidatorsOnline < 0 || percentageOfValidatorsOnline > 100.0) {
            return formResponse(500, formErrorMessage('Invalid percentage computation'));
        }

        let maxSlashableAmountPerLiveness = debtPosition.maxSlashableAmountPerLiveness;
        slashAmount = (maxSlashableAmountPerLiveness.mul(ethers.BigNumber.from(livenessData.numOfValidatorsOffline))).div(ethers.BigNumber.from(livenessData.totalValidators));
        if (slashAmount.toString() !== proposedSlashing.toString()) {
            return formResponse(500, formErrorMessage(`Invalid slash amount. Expected ${slashAmount} based on ${maxSlashableAmountPerLiveness} max slashing`));
        }

        // fill the final report data
        report = {
            ...report,
            amount: ethers.BigNumber.from(slashAmount.toString())
        }
    } else if (eventType === EVENT_TYPES.CORRUPTION) {
        const {
            events,
            proposedSlashing
        } = eventData;

        if (!rpbsSelfAttestation.commonInfo.events) {
            return formResponse(500, formErrorMessage('No corruption events specified in RPBS'));
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
                        'Access-Control-Allow-Origin': '*'
                    }
                }
            )).data;
        } catch (e) {
            return formResponse(500, formErrorMessage('Unable to validate corruption events'));
        }
        console.log('Corruption response', corruptionResponse);

        let severityScore = Number(corruptionResponse.severityScore);
        if (isNaN(severityScore) || severityScore < 0.0 || severityScore > 1.0) {
            return formResponse(500, formErrorMessage('Invalid severity score'));
        }

        let maxSlashableAmountPerCorruption = debtPosition.maxSlashableAmountPerCorruption.toString();
        slashAmount = (Number(maxSlashableAmountPerCorruption) * severityScore);
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
                eventData
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            }
        )).data

        if (isNaN(reportIdentifier.nextIdentifier) || Number(reportIdentifier.nextIdentifier) < 0) {
            return formResponse(500, formErrorMessage(`Invalid report identifier`));
        }

        reportIdentifier = reportIdentifier.nextIdentifier;
    } catch (e) {
        return formResponse(500, formErrorMessage(`Unable to get a report identifier`));
    }

    console.log('Report verified');

    // Sign the report and let the reporter collect their earnings
    const signedSlashingReport = await signSlashingReport(
        signingWallet,
        CHAIN_ID,
        K_SQUARED_REPORTER_REGISTRY,
        {
            ...report,
            identifier: Number(reportIdentifier)
        }
    );

    console.log('Signature issued', signedSlashingReport);

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