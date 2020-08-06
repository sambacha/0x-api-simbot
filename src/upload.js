'use strict';
require('colors');
const yargs = require('yargs');
const { createConnection, EntitySchema } = require('typeorm');
const fs = require('fs');
const readline = require('readline');

class SimulationResult {
    constructor(
        runId,
        simId,
        url,
        makerToken,
        takerToken,
        sellAmount,
        buyAmount,
        responseTime,
        side,
        reverted,
        soldAmount,
        boughtAmount,
        gasUsed,
        ethUsd,
        makerTokenUsd,
        makerTokenDecimals,
        takerTokenDecimals
    ) {
        this.runId = runId;
        this.simId = simId;
        this.url = url;
        this.makerToken = makerToken;
        this.takerToken = takerToken;
        this.sellAmount = sellAmount;
        this.buyAmount = buyAmount;
        this.responseTime = responseTime;
        // Buy or Sell
        this.side = side;
        this.reverted = reverted;
        // May not be present or useful if the sim reverted
        this.soldAmount = soldAmount || 0;
        this.boughtAmount = boughtAmount || 0;
        this.gasUsed = gasUsed;
        this.ethUsd = ethUsd;
        this.makerTokenUsd = makerTokenUsd;
        this.makerTokenDecimals = makerTokenDecimals;
        this.takerTokenDecimals = takerTokenDecimals;
    }
}
const simulationResultEntity = new EntitySchema({
    name: 'SimulationResult',
    target: SimulationResult,
    columns: {
        id: {
            primary: true,
            type: 'int',
            generated: true,
        },
        runId: {
            type: 'varchar',
        },
        simId: {
            type: 'varchar',
        },
        url: {
            type: 'varchar',
        },
        makerToken: {
            type: 'varchar',
        },
        takerToken: {
            type: 'varchar',
        },
        sellAmount: {
            type: 'numeric',
            precision: 78,
            scale: 0,
        },
        buyAmount: {
            type: 'numeric',
            precision: 78,
            scale: 0,
        },
        responseTime: {
            type: 'float',
        },
        reverted: {
            type: 'boolean',
        },
        soldAmount: {
            type: 'numeric',
            precision: 78,
            scale: 0,
            nullable: true,
        },
        boughtAmount: {
            type: 'numeric',
            precision: 78,
            scale: 0,
            nullable: true,
        },
        gasUsed: {
            type: 'numeric',
            precision: 78,
            scale: 0,
        },
        ethUsd: {
            type: 'float',
        },
        makerTokenUsd: {
            type: 'float',
        },
        makerTokenDecimals: {
            type: 'int',
        },
        takerTokenDecimals: {
            type: 'int',
        },
    },
    indices: [
        {
            name: 'sim_id_index',
            unique: false,
            columns: ['simId'],
        },
    ],
});

let _connection;

const createConnectionAsync = async (url) => {
    if (!_connection) {
        _connection = await createConnection({
            type: 'postgres',
            synchronize: true,
            entities: [simulationResultEntity],
            url,
        });
    }
    return _connection;
};

const saveResultAsync = async (connection, result) => {
    const {
        runId,
        id: simId,
        makerToken,
        takerToken,
        apiPath: url,
        side,
        responseTime,
        ethUsd,
        makerTokenUsd,
        makerTokenDecimals,
        takerTokenDecimals,
    } = result.metadata;
    const { sellAmount, buyAmount } = result;
    const {
        gasUsed,
        revertData,
        soldAmount,
        boughtAmount,
    } = result.metadata.swapResult;
    const simulationResult = new SimulationResult(
        runId,
        simId,
        url,
        makerToken,
        takerToken,
        sellAmount,
        buyAmount,
        responseTime,
        side,
        revertData != '0x',
        soldAmount,
        boughtAmount,
        gasUsed,
        ethUsd,
        makerTokenUsd,
        makerTokenDecimals,
        takerTokenDecimals
    );
    try {
        await connection.manager.save(simulationResult);
    } catch (e) {
        console.log(e);
        // Do nothing
    }
};

module.exports = {
    createConnectionAsync,
    saveResultAsync,
};

void (async () => {
    try {
        if (!module.parent) {
            const ARGV = yargs
                .option('db', {
                    type: 'string',
                    demandOption: true,
                    describe: 'URI to the database to upload to',
                })
                .option('input', {
                    alias: 'i',
                    demandOption: true,
                    type: 'string',
                    describe: 'input file of simulation results',
                }).argv;
            const connection = await createConnectionAsync(ARGV.db);
            const rl = readline.createInterface({
                input: fs.createReadStream(ARGV.input),
                console: false,
            });
            const results = [];
            for await (const line of rl) {
                results.push(JSON.parse(line));
            }
            for (const result of results) {
                await saveResultAsync(connection, result);
            }
            process.exit(0);
        }
    } catch (e) {
        console.log(e);
        process.exit(1);
    }
})();
