'use strict';

import vinyl = require('vinyl');

function listImports(file: vinyl): Promise<string[]>
{
    let promise = new Promise<string[]>((resolve, reject) =>
    {
        resolve([]);
    });
    
    return promise;
}

export = listImports;