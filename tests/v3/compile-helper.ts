import { Cell } from '@ton/core';
import { compileFunc } from '@ton-community/func-js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Compile helper for V3 contracts
 *
 * Blueprint's default compile() function looks for wrappers/{name}.compile.ts
 * Our V3 contracts are in wrappers/v3/{name}.compile.ts
 * This helper imports the compile config directly and compiles the contract
 */
export async function compileV3(contractName: string): Promise<Cell> {
    // Import the compile config dynamically
    const compilePath = path.join(__dirname, '../../wrappers/v3', `${contractName}.compile.ts`);

    if (!fs.existsSync(compilePath)) {
        throw new Error(`Compile config not found: ${compilePath}`);
    }

    const { compile: compileConfig } = await import(`../../wrappers/v3/${contractName}.compile.ts`);

    if (!compileConfig || !compileConfig.targets) {
        throw new Error(`Invalid compile config for ${contractName}`);
    }

    // Use func-js to compile the FunC contract
    const result = await compileFunc({
        targets: compileConfig.targets,
        sources: (x) => fs.readFileSync(path.join(__dirname, '../../', x)).toString('utf-8'),
    });

    if (result.status === 'error') {
        throw new Error(`Compilation failed: ${result.message}`);
    }

    return Cell.fromBoc(Buffer.from(result.codeBoc, 'base64'))[0];
}
