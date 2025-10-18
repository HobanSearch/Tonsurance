import { Config } from '@ton/blueprint';

export const config: Config = {
    project: {
        type: 'ton',
        contracts: ['contracts/core', 'contracts/shared', 'contracts/tranches', 'contracts/oracles', 'contracts/config']
    },
    network: {
        version: 'v4',
        workchain: 0
    }
};
