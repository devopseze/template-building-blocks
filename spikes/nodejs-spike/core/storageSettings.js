
var fs = require('fs');
var _ = require('../lodashMixins.js');
let v = require('./validation.js');
var murmurHash = require('murmurhash-native').murmurHash64

const storageDefaultsFile = './defaults/storageSettings.json';
const diagDefaultsFile = './defaults/diagnosticStorageSettings.json';

function merge(settings, key) {
    let defaults;
    if (key === 'storageAccounts') {
        defaults = JSON.parse(fs.readFileSync(storageDefaultsFile, 'UTF-8'));
    } else {
        defaults = JSON.parse(fs.readFileSync(diagDefaultsFile, 'UTF-8'));
    }

    return v.merge(settings, defaults)
}

let storageValidations = {
    count: (value, parent) => {
        return {
            result: (parent.managed) || ((_.isFinite(value)) && value > 0),
            message: 'Value must be greater than 0'
        };
    },
    managed:  v.validationUtilities.isBoolean,
    nameSuffix: v.utilities.isNotNullOrWhitespace,
    skuType: (value, parent) => {
        return {
            result: (parent.managed) || v.utilities.isNotNullOrWhitespace(value),
            message: 'Value cannot be null or empty string if managed is set to false'
        };
    }
};

let diagnosticValidations = {
    managed: (value, parent) => {
        if (!_.isBoolean(value)) {
            return {
                result: false,
                message: 'Value must be Boolean'
            }
        }
        return {
            result: !value,
            message: 'Diagnostic storage cannot be managed.'
        };
    },
    skuType: (value, parent) => {
        return {
            result: (v.utilities.isNotNullOrWhitespace(value)) && !_.includes(_.toLower(value), "premium"),
            message: 'Diagnostic storage cannot use premium storage.'
        }
    },
    count: (value, parent) => {
        return {
            result: ((_.isFinite(value)) && value > 0),
            message: 'Value must be greater than 0'
        };
    },
    nameSuffix: v.utilities.isNotNullOrWhitespace
};

function convertToBase32(carryOverValue, carryOverBits, buffer) {
    if (buffer.length === 0) return "";

    let charSet = "abcdefghijklmnopqrstuvwxyz234567";
    let base32String = "";
    let valueToProcess = carryOverValue * 256 + buffer[0];
    let bitsCount = carryOverBits + 8;

    do {
        let value = valueToProcess;
        if (bitsCount >= 5) {
            bitsCount -= 5;
            value = valueToProcess >> bitsCount;
        }
        base32String += charSet[value];
        value <<= bitsCount;
        valueToProcess -= value;
    } while (valueToProcess > 32 || (buffer.length === 1 && valueToProcess > 0));

    base32String += convertToBase32(valueToProcess, bitsCount, buffer.slice(1));
    return base32String;
}

function getUniqueString(input) {
    let buffer = murmurHash(JSON.stringify(input), 'buffer');

    return convertToBase32(0, 0, buffer);
}

function createStamps(settings, parent) {
    // deep clone settings for the number of VMs required (vmCount)  
    return _.transform(_.castArray(settings), (result, n) => {
        for (let i = 0; i < settings.count - settings.accounts.length; i++) {
            result.push(_.cloneDeep(n));
        }
        return result;
    }, []);
}

function process(settings, parent) {
    if (settings.managed) {
        return [];
    }
    return _.transform(createStamps(settings, parent), (result, n, index) => {
        let instance = {
            name: `vm${getUniqueString(parent)}${n.nameSuffix}${index + 1}`,
            kind: 'Storage',
            sku: {
                name: n.skuType
            }
        };
        result.push(instance);
        return result;
    }, [])
}

exports.processStorageSettings = process;
exports.mergeWithDefaults = merge;
exports.storageValidations = storageValidations;
exports.diagnosticValidations = diagnosticValidations;