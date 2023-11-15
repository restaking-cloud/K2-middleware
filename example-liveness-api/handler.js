const {formResponse, formErrorMessage} = require('./response-utils');

/// @dev Service provider infrastructure should have some way of knowing who's supposed to be running software associated with an SBP position
/// @dev Different SLAs will have different definitions of liveness
/// @dev For example Proof of Neutrality (pon.network), defines liveness issues as builder not publishing a block or proposer not signing a block header after requesting the header from the relayer
const liveness = async (req) => {
    if (!req || !req.queryStringParameters) {
        return formResponse(500, formErrorMessage('Invalid query'));
    }

    const query = req.queryStringParameters;
    console.log('Query', query)

    // This is a value between 0 and 1 that will be used by the middleware to determine whether the full penalty for the category (liveness) should be applied or a pro-rated version
    let severityScore;

    // Here we simulate a simple liveness response that could just check the consensus layer for % of active validators at a specific epoch
    // Based on the outcome, a reporter would slash accordingly
    let livenessData;
    if (query.slot && query.slot === '5') {
        livenessData = {
            numOfValidatorsOnline: '8',
            numOfValidatorsOffline: '2',
            totalValidators: '10'
        }
        severityScore = '0.2'
    } else {
        livenessData = {
            numOfValidatorsOnline: '10',
            numOfValidatorsOffline: '0',
            totalValidators: '10'
        }
        severityScore = '0'
    }

    return formResponse(200, {
        livenessData,
        severityScore
    });
}

module.exports = {
    liveness
}