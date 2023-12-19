const { ethers } = require('ethers');
const R = require('@blockswaplab/rpbs-self-attestation');

const { EVENT_TYPES } = require('../constants');
const { utf8ToHex } = require('../services/utils');
const { deserialiseRPBSSelfAttestation } = require('../services/rpbs');
const { getKSquaredLending } = require('../services/contracts');
const { formResponse, formErrorMessage } = require('../response-utils');
const { readEnv } = require('../services/environment');
const { validateBodyFromRequest, validateEvent } = require('../services/validation');
const {
    getProvider,
    getCurrentBlockNumber,
    getSigningWallet,
    signSlashingReport
} = require('../services/signer');

const { 
    livenessDataValidation, 
    livenessResponseValidation,
    corruptionDataValidation
} = require('./services/report/validation');

const { 
    fetchLivenessInfo, 
    verifyCorruptionEvents, 
    generateReportIdentifier 
} = require('./services/report/http');

const reportHandler = async (req) => {
    console.log('Request for report verification triggered!');

    // Perform request body validation
    const bodyValidationErrors = validateBodyFromRequest(req);
    if (bodyValidationErrors) return bodyValidationErrors;

    // Extract event variables from body
    const {
        rpbsSelfAttestation,                                    // Interactive ZK attestation of liveness or corruption detected by the reporter
        eventType,                                              // Liveness or corruption 
        version,                                                // Payload version submitted by reporter
        eventData,                                              // Data related to the event type
        serviceProviderAddress: SERVICE_PROVIDER_BORROW_ADDRESS // Service provider that owns an SBP position
    } = JSON.parse(req.body);

    // Validate event
    const eventValidationErrors = validateEvent(eventType, rpbsSelfAttestation, version);
    if (eventValidationErrors) return eventValidationErrors;

    // For debugging
    console.log('Event', JSON.stringify({rpbsSelfAttestation, eventType, version, SERVICE_PROVIDER_BORROW_ADDRESS}));

    // Perform RPBS verification on the reporter
    let signature = deserialiseRPBSSelfAttestation(rpbsSelfAttestation);
    const isRPBSValid = R.rpbs.verifySignature(
        R.curveOperations.decodePointInRPBSFormat(rpbsSelfAttestation.publicKey),
        JSON.stringify(rpbsSelfAttestation.commonInfo),
        signature
    );

    // Stop execution if there are problems with the ZK
    if (!isRPBSValid) {
        return formResponse(500, formErrorMessage('Invalid RPBS self attestation'));
    }

    // Read environment variables for the rest of the execution
    const {
        PROVIDER_URL,
        K_SQUARED_LENDING_CONTRACT,
        DESIGNATED_VERIFIER_PRIVATE_KEY,
        REPORT_DEADLINE_LENGTH_IN_ETH_BLOCKS,
        CHAIN_ID,
        K_SQUARED_REPORTER_REGISTRY,
    } = readEnv();

    const provider = getProvider(PROVIDER_URL);
    const kSquaredLending = getKSquaredLending(provider, K_SQUARED_LENDING_CONTRACT);
    const debtPosition = await kSquaredLending.getDebtor(SERVICE_PROVIDER_BORROW_ADDRESS);
    
    // If there is not an SBP associated with the service provider being slashed - terminate early
    if (debtPosition.endTimestamp.toString() === '0') {
        return formResponse(500, formErrorMessage('No debt position'));
    }

    // Placeholder variable for calculating the slash amount
    let slashAmount;

    // Start generating the report and then verify the data submitted by the reporter
    let report = {
        slashType: eventType === EVENT_TYPES.LIVENESS ? '0' : '1',  // Convert to the smart contract enum
        debtor: SERVICE_PROVIDER_BORROW_ADDRESS,                    // SBP owner that is getting slashed
        signature: utf8ToHex(Object.keys(rpbsSelfAttestation.signature).map(
            k => rpbsSelfAttestation.signature[k]
        ).join(':')) // Convert RPBS signature to a HEX string that the smart contracts will accept
    };

    if (eventType === EVENT_TYPES.LIVENESS) {

        const livenessDataValidationErrors = livenessDataValidation(eventData, rpbsSelfAttestation);
        if (livenessDataValidationErrors) return livenessDataValidationErrors;

        const { query, livenessData, proposedSlashing } = eventData;
        const { livenessResponse, error: fetchLivenessError } = await fetchLivenessInfo(query);        
        if (fetchLivenessError) return fetchLivenessError;

        const livenessResponseValidationErrors = livenessResponseValidation(livenessResponse, livenessData, rpbsSelfAttestation);
        if (livenessDataValidationErrors) return livenessResponseValidationErrors;

        let maxSlashableAmountPerLiveness = debtPosition.maxSlashableAmountPerLiveness;
        slashAmount = (maxSlashableAmountPerLiveness.mul(ethers.BigNumber.from(ethers.utils.parseEther(livenessResponse.severityScore)))).div(ethers.utils.parseEther('1'));
        if (slashAmount.toString() !== proposedSlashing.toString()) {
            return formResponse(500, formErrorMessage(`Invalid slash amount. Expected ${slashAmount} based on ${maxSlashableAmountPerLiveness} max slashing`));
        }

        // fill in the slash amount to the report
        report['amount'] = ethers.BigNumber.from(slashAmount.toString());

    } else if (eventType === EVENT_TYPES.CORRUPTION) {
        // Validate corruption event data provided by K2 reporter
        const corruptionDataValidationErrors = corruptionDataValidation(eventData, rpbsSelfAttestation);
        if (corruptionDataValidationErrors) return corruptionDataValidationErrors;

        // Corruption events externally validated outside of middleware
        const { events, proposedSlashing } = eventData;
        const { corruptionResponse, error: verifyCorruptionError } = await verifyCorruptionEvents(events);
        if (verifyCorruptionError) return verifyCorruptionError;

        // Compute the slash amount based on the severity score and check its in line with what the reporter is proposing
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
        report['amount'] = ethers.BigNumber.from(slashAmount.toString());
    }

    // Generate a unique report identifier that allows the event to be reported to the contract once
    const {reportIdentifier, error: generateReportIdentifierError} = await generateReportIdentifier(
        report,
        eventData,
        eventType,
        SERVICE_PROVIDER_BORROW_ADDRESS
    );
    if (generateReportIdentifierError) return generateReportIdentifierError;

    console.log('Report will be verified with identifier', reportIdentifier.toString());

    // Sign the report and let the reporter collect their earnings. The report will expire.
    const signingWallet = getSigningWallet(DESIGNATED_VERIFIER_PRIVATE_KEY, provider);
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

    console.log('Signature issued. Completing execution.');

    // Revert back to the K2 reporter and inform on what input the slashing report was authorized
    return formResponse(200, {
        inputs: {
            rpbsSelfAttestation,
            eventType,
            version,
            eventData
        },
        signedReport: {
            ...report,
            identifier: Number(reportIdentifier.toString())
        },
        designatedVerifierSignature: {
            deadline,
            v: signedSlashingReport.v.toString(),
            r: `0x${Buffer.from(signedSlashingReport.r).toString('hex')}`,
            s: `0x${Buffer.from(signedSlashingReport.s).toString('hex')}`,
        }
    });
}

module.exports = {
    reportHandler
}