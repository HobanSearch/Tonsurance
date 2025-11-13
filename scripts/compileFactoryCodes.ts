/**
 * Simple script to compile factory codes and show what transactions to send
 *
 * Run with: npx ts-node scripts/compileFactoryCodes.ts
 */

import { beginCell } from '@ton/core';
import { compile } from '@ton/blueprint';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    console.log('\n📦 Compiling Factory Codes...\n');

    try {
        // Compile DepegSubFactory
        console.log('Compiling DepegSubFactory...');
        const depegCode = await compile('DepegSubFactory');
        const depegBase64 = depegCode.toBoc().toString('base64');
        console.log('✓ DepegSubFactory compiled\n');

        // Compile TradFiNatCatFactory
        console.log('Compiling TradFiNatCatFactory...');
        const tradFiCode = await compile('TradFiNatCatFactory');
        const tradFiBase64 = tradFiCode.toBoc().toString('base64');
        console.log('✓ TradFiNatCatFactory compiled\n');

        // Save to files
        const outputDir = path.join(__dirname, '..', 'build');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(
            path.join(outputDir, 'DepegSubFactory.compiled.json'),
            JSON.stringify({ hex: depegCode.toBoc().toString('hex'), base64: depegBase64 }, null, 2)
        );

        fs.writeFileSync(
            path.join(outputDir, 'TradFiNatCatFactory.compiled.json'),
            JSON.stringify({ hex: tradFiCode.toBoc().toString('hex'), base64: tradFiBase64 }, null, 2)
        );

        console.log('✅ Compiled codes saved to build/ directory\n');
        console.log('═'.repeat(60));
        console.log('\n📋 NEXT STEPS:\n');
        console.log('You now need to send 2 transactions to MasterFactory to register these codes.\n');
        console.log('MasterFactory Address:');
        console.log('EQDsE9sylBzHemAHY1x6D7UO2wk27mjTgM6v6f4j2T2Z3TzG\n');
        console.log('The compiled codes are saved in:');
        console.log(`  - build/DepegSubFactory.compiled.json`);
        console.log(`  - build/TradFiNatCatFactory.compiled.json\n`);
        console.log('You can use these files with the registration script or send manually.\n');

    } catch (error) {
        console.error('❌ Compilation failed:', error);
        process.exit(1);
    }
}

main();
