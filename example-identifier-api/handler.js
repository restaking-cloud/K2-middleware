const {formResponse, formErrorMessage} = require('./response-utils');

/// @dev Service provider infrastructure should have some way of generating report identifiers to distinguish events in a way that the contracts will not allow reporting the same event twice
const nextIdentifier = async (req) => {
    const body = JSON.parse(req.body);
    if (!body) {
        return formResponse(500, formErrorMessage('Missing body'));
    }

    if (!body.report || !body.eventData) {
        return formResponse(500, formErrorMessage('Invalid body data'));
    }

    // Here any kind of additional checks can be performed. Assume that the report has been validated at this point as is about to be signed

    return formResponse(200, {
        // In this example, it's always returning the uint '2'. Many reports can be issued under the same identifier
        // but the smart contract will only accept 1 report for a given unsigned integer (uint256)
        nextIdentifier: '2'
    });
}

module.exports = {
    nextIdentifier
}