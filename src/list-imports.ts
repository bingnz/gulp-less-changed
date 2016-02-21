'use strict';

import vinyl = require('vinyl');
import * as less from 'less';

function listImports(file: vinyl): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        if (file == null || file.isNull()) {
            console.error('Trying to process imports for null file.')
            return resolve([]);
        }

        let lessData = file.contents.toString();
        let options = { filename: file.path };

        less
            .render(lessData, options)
            .then(value => {
                resolve(value.imports);
            })
            .catch(reason => {
                console.error('Failed to process imports for \'' + file.path + '\': ' + reason);
                resolve([]);
            });
    });
}

export = listImports;