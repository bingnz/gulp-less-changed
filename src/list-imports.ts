'use strict';

import vinyl = require('vinyl');
import * as less from 'less';
import * as path from 'path';
import streamToArray = require('stream-to-array');

module listImports {
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
                if (self._imports.indexOf(importPath) < 0) {
                    self._imports.push(importPath);
                }
            });
        }

        public get imports(): string[] {
            return this._imports;
        }
    }

    function getLessData(file: vinyl): Promise<string> {
        if (file.isBuffer()) {
            return new Promise<string>((resolve, reject) => {
                process.nextTick(() => resolve(file.contents.toString()));
            });
        }

        return streamToArray(<NodeJS.ReadableStream>file.contents)
            .then(parts => {
                let buffers: Buffer[] = [];
                for (let i = 0; i < parts.length; ++i) {
                    let part = parts[i]
                    buffers.push((part instanceof Buffer) ? part : new Buffer(part))
                }
                return Buffer.concat(buffers).toString();
            });
    }

    export function listImports(file: vinyl): Promise<string[]> {
        return new Promise<string[]>((resolve, reject) => {
            if (file == null || file.isNull()) {
                console.error('Trying to process imports for null file.')
                return resolve([]);
            }

            let dataUri = new dataUriPlugin();
            let options = { filename: file.path, plugins: [dataUri] };

            getLessData(file)
                .then(lessData => {
                    less
                        .render(lessData, options)
                        .then(value => {
                            resolve(value.imports.concat(dataUri.imports));
                        })
                        .catch(reason => {
                            console.error('Failed to process imports for \'' + file.path + '\': ' + reason);
                            resolve([]);
                        });
                })
        });
    }
}

export = listImports;

