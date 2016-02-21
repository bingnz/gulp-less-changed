'use strict';

import vinyl = require('vinyl');
import * as less from 'less';
import * as path from 'path';

class dataUriPlugin {
    private _imports: string[];
    
    constructor() {
        this._imports = [];
    }

    public install(lessLocal: Less.LessStaticExtensions, pluginManager: any): void {
        let self = this;
        lessLocal.functions.functionRegistry.add('data-uri', function(mimeType: any, file: any) {
            let importedFile = file;
            if (!importedFile) {
                importedFile = mimeType;
            }
            let importPath = path.join(this.currentFileInfo.currentDirectory, importedFile.value);
            self._imports.push(importPath);
        });
    }

    public get imports(): string[] {
        return this._imports;
    }
}

function listImports(file: vinyl): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        if (file == null || file.isNull()) {
            console.error('Trying to process imports for null file.')
            return resolve([]);
        }

        let lessData = file.contents.toString();
        let dataUri = new dataUriPlugin();
        let options = { filename: file.path, plugins: [dataUri] };

        less
            .render(lessData, options)
            .then(value => {
                resolve(value.imports.concat(dataUri.imports));
            })
            .catch(reason => {
                console.error('Failed to process imports for \'' + file.path + '\': ' + reason);
                resolve([]);
            });
    });
}

export = listImports;