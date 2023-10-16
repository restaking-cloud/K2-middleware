const R = require('@blockswaplab/rpbs-self-attestation');

async function main() {
    console.log('Spinning up\n');

    // Example self attestor with a random private key spun up each time but can be configured with a fixed private key
    const selfAttester = R.rpbs.SelfAttester.createSelfAttester();

    // Utils for getting the public key
    const rpbsPubKey = R.curveOperations.encodePointInRPBSFormat(selfAttester.publicKey)
    console.log("Self attestor public key:", rpbsPubKey, '\n');

    // Example liveness report reporter is self attesting
    const info = JSON.stringify({
        numOfValidatorsOnline: '8',
        numOfValidatorsOffline: '2',
        totalValidators: '10'
    });
    console.log('Info', info, '\n');

    // Some info relative to the reporter that doesn't need to be revealed
    const message = JSON.stringify({
        'reportCount': '5'
    });

    // Self attestation and marshalling signature
    const signature = selfAttester.generateSignature(info, message)
    const marshalledSignature = {
        ...signature,
        z1Hat: R.curveOperations.encodePointInRPBSFormat(signature.z1Hat),
        m1Hat: R.curveOperations.encodePointInRPBSFormat(signature.m1Hat)
    }
    console.log('Signature', JSON.stringify(marshalledSignature), '\n');

    // Signature verification
    const valid = R.rpbs.verifySignature(selfAttester.publicKey, info, signature)
    console.log("Sense check - Is signature valid? ", valid);
}

main();