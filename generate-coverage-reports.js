var remapIstanbul = require('remap-istanbul');

remapIstanbul('./coverage/coverage-final.json', {
    'json': './coverage/coverage-remapped.json',
    'html': './coverage/html',
    'lcovonly': './coverage/lcov.info',
    'text': null
});