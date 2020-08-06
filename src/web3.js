'use strict';
const fs = require('fs');
const path = require('path');
const ethjs = require('ethereumjs-util');
const FlexEther = require('flex-ether');
const FlexContract = require('flex-contract');

const eth = new FlexEther({ providerURI: process.env.NODE_RPC });
const artifactCache = {};

function loadArtifact(artifactPath) {
    if (!path.isAbsolute(artifactPath)) {
        artifactPath = path.resolve(__dirname, '..', artifactPath);
    }
    if (artifactCache[artifactPath]) {
        return artifactCache[artifactPath];
    }
    return (artifactCache[artifactPath] = standardizeArtifact(
        JSON.parse(fs.readFileSync(artifactPath))
    ));
}

function standardizeArtifact(artifact) {
    if (artifact.compilerOutput) {
        // 0x artifact.
        return {
            abi: artifact.compilerOutput.abi,
            bytecode: artifact.compilerOutput.evm.bytecode.object,
            deployedBytecode:
                artifact.compilerOutput.evm.deployedBytecode.object,
        };
    }
    // soluble artifact.
    return {
        abi: artifact.abi,
        bytecode: ethjs.addHexPrefix(artifact.bytecode),
        deployedBytecode: ethjs.addHexPrefix(artifact.deployedBytecode),
    };
}

function createContractFromArtifact(artifact, address) {
    return new FlexContract(artifact.abi, address, {
        eth,
        bytecode: artifact.bytecode,
    });
}

function createContractFromArtifactPath(artifactPath, address) {
    const artifact = loadArtifact(artifactPath);
    return new FlexContract(artifact.abi, address, {
        eth,
        bytecode: artifact.bytecode,
    });
}

module.exports = {
    eth,
    loadArtifact,
    createContractFromArtifact,
    createContractFromArtifactPath,
};
