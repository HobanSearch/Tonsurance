// Build transaction payloads for factory code registration
// Run with: node build-transaction-payloads.js

const { Cell, beginCell } = require('@ton/core');
const fs = require('fs');

// Load the deployed factory codes
const depegData = JSON.parse(fs.readFileSync('build/DepegSubFactory.deployed.json', 'utf8'));
const tradFiData = JSON.parse(fs.readFileSync('build/TradFiNatCatFactory.deployed.json', 'utf8'));

// Parse the code cells from base64
const depegCodeCell = Cell.fromBase64(depegData.codeBase64);
const tradFiCodeCell = Cell.fromBase64(tradFiData.codeBase64);

// Build transaction payloads
// Format: op (32-bit) | product_type (8-bit) | code_ref

// Payload 1: Register DepegSubFactory (product_type = 1)
const depegPayload = beginCell()
    .storeUint(0x22, 32)  // op::set_factory_code
    .storeUint(1, 8)      // PRODUCT_DEPEG
    .storeRef(depegCodeCell)
    .endCell();

// Payload 2: Register TradFiNatCatFactory (product_type = 5)
const tradFiPayload = beginCell()
    .storeUint(0x22, 32)  // op::set_factory_code
    .storeUint(5, 8)      // PRODUCT_TRADFI_NATCAT
    .storeRef(tradFiCodeCell)
    .endCell();

// Convert to base64
const depegPayloadBase64 = depegPayload.toBoc().toString('base64');
const tradFiPayloadBase64 = tradFiPayload.toBoc().toString('base64');

// Save to file
const output = {
    depegPayload: depegPayloadBase64,
    tradFiPayload: tradFiPayloadBase64
};

fs.writeFileSync('build/transaction-payloads.json', JSON.stringify(output, null, 2));

console.log('\n✅ Transaction payloads built successfully!\n');
console.log('DepegSubFactory payload length:', depegPayloadBase64.length, 'bytes');
console.log('TradFiNatCatFactory payload length:', tradFiPayloadBase64.length, 'bytes');
console.log('\nSaved to: build/transaction-payloads.json\n');
console.log('DepegSubFactory payload preview:');
console.log(depegPayloadBase64.substring(0, 100) + '...\n');
console.log('TradFiNatCatFactory payload preview:');
console.log(tradFiPayloadBase64.substring(0, 100) + '...\n');
