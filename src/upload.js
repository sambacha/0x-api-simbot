'use strict';
require('colors');
const yargs = require('yargs');
const { createConnection, EntitySchema } = require('typeorm');
const fs = require('fs');
const readline = require('readline');
const _ = require('lodash');

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
        gasPrice,
        ethUsd,
        makerTokenUsd,
        makerTokenDecimals,
        takerTokenDecimals,
        fillDelay,
        fillValueUsd,
        protocolFeePaid,
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
        this.gasPrice = gasPrice;
        this.ethUsd = ethUsd;
        this.makerTokenUsd = makerTokenUsd;
        this.makerTokenDecimals = makerTokenDecimals;
        this.takerTokenDecimals = takerTokenDecimals;
        this.fillDelay = fillDelay;
        this.fillValueUsd = fillValueUsd;
        this.protocolFeePaid = protocolFeePaid;
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
            name: 'run_id',
            type: 'varchar',
        },
        simId: {
            name: 'sim_id',
            type: 'varchar',
        },
        url: {
            type: 'varchar',
        },
        makerToken: {
            name: 'maker_token',
            type: 'varchar',
        },
        takerToken: {
            name: 'taker_token',
            type: 'varchar',
        },
        sellAmount: {
            name: 'sell_amount',
            type: 'numeric',
            precision: 78,
            scale: 0,
        },
        buyAmount: {
            name: 'buy_amount',
            type: 'numeric',
            precision: 78,
            scale: 0,
        },
        responseTime: {
            name: 'response_time',
            type: 'float',
        },
        reverted: {
            type: 'boolean',
        },
        soldAmount: {
            name: 'sold_amount',
            type: 'numeric',
            precision: 78,
            scale: 0,
            nullable: true,
        },
        boughtAmount: {
            name: 'bought_amount',
            type: 'numeric',
            precision: 78,
            scale: 0,
            nullable: true,
        },
        gasUsed: {
            name: 'gas_used',
            type: 'numeric',
            precision: 78,
            scale: 0,
        },
        gasPrice: {
            name: 'gas_price',
            type: 'numeric',
            precision: 78,
            scale: 0,
        },
        ethUsd: {
            name: 'eth_usd',
            type: 'float',
        },
        makerTokenUsd: {
            name: 'maker_token_usd',
            type: 'float',
        },
        makerTokenDecimals: {
            name: 'maker_token_decimals',
            type: 'int',
        },
        takerTokenDecimals: {
            name: 'taker_token_decimals',
            type: 'int',
        },
        fillDelay: {
            name: 'fill_delay',
            type: 'float',
        },
        fillValueUsd: {
            name: 'fill_value_usd',
            type: 'float',
        },
        protocolFeePaid: {
            name: 'protocol_fee_paid',
            type: 'numeric',
            precision: 78,
            scale: 0,
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

const parseResult = (result) => {
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
        fillDelay,
        fillValue: fillValueUsd,
    } = result.metadata;
    const { sellAmount, buyAmount, gasPrice } = result;
    const {
        gasUsed,
        revertData,
        soldAmount,
        boughtAmount,
        protocolFeePaid,
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
        revertData != '0x' || boughtAmount == '0',
        soldAmount,
        boughtAmount,
        gasUsed,
        gasPrice,
        ethUsd,
        makerTokenUsd,
        makerTokenDecimals,
        takerTokenDecimals,
        fillDelay,
        fillValueUsd,
        protocolFeePaid
    );
    return simulationResult;
}

const saveResultAsync = async (connection, result) => {
    try {
        await connection.manager.save(parseResult(result));
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
            console.log(`Uploading ${results.length} results`);
            const chunks = _.chunk(results, 100);
            for (const chunk of chunks) {
                const parsedChunks = chunk.map(r => parseResult(r));
                await connection.manager.save(parsedChunks);
            }
            process.exit(0);
        }
    } catch (e) {
        console.log(e);
        process.exit(1);
    }
})();
