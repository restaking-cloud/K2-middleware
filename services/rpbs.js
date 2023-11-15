const R = require('@blockswaplab/rpbs-self-attestation');
const BN = require("bn.js");

function deserialiseRPBSSelfAttestation(rpbsSelfAttestation) {
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
    return signature;
}

module.exports = {
    deserialiseRPBSSelfAttestation
}