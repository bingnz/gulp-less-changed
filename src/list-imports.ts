'use strict';

import File = require('vinyl');
import * as less from 'less';
import * as path from 'path';
import streamToArray = require('stream-to-array');
import * as Promise from 'bluebird';
import { ImportBuffer, FileInfo } from './import-buffer';

module importLister {

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
                let importPath = path.normalize(path.join(this.currentFileInfo.entryPath, importedFile.value));
                if (self._imports.indexOf(importPath) < 0) {
                    self._imports.push(importPath);
                }
            });
        }

        public get imports(): string[] {
            return this._imports;
        }
    }

    export class ImportLister {
        importBuffer: ImportBuffer;

        constructor(private paths: string[]) {
            this.importBuffer = new ImportBuffer(this.listImportsInternal.bind(this));
        }

        private getLessData(file: File): Promise<string> {
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

        private listImportsInternal(file: File): Promise<string[]> {
            return new Promise<string[]>((resolve, reject) => {
                if (file == null || file.isNull()) {
                    console.error('Trying to process imports for null file.')
                    return resolve([]);
                }

                let dataUri = new dataUriPlugin();
                let options: Less.Options2 = { filename: file.path, plugins: [dataUri] };

                if (this.paths) {
                    let optionsPaths: string[] = [];
                    optionsPaths.push(...this.paths)
                    options.paths = optionsPaths;
                }

                this.getLessData(file)
                    .then(lessData => {
                        (<Less.RelaxedLessStatic>less)
                            .render(lessData, options)
                            .then(value => {
                                // TODO: pass dataUri.imports to a path resolver.
                                resolve(value.imports.concat(dataUri.imports));
                            })
                            .catch(reason => {
                                console.error('Failed to process imports for \'' + file.path + '\': ' + reason);
                                resolve([]);
                            });
                    })
            });
        }

        public listImports(file: File): Promise<FileInfo[]> {
            if (!file) {
                return Promise.resolve([]);
            }

            return this.importBuffer.listImports(file);
        }
    }
}

export = importLister;

