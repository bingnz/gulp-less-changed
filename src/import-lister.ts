'use strict';

import File = require('vinyl');
import * as less from 'less';
import * as path from 'path';
import streamToArray = require('stream-to-array');
import * as Promise from 'bluebird';
import { ImportBuffer, FileInfo } from './import-buffer';
import { PathResolver } from './path-resolver';

module importLister {

    class DataUriPlugin {
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
        pathResolver: PathResolver;

        constructor(private paths: string[]) {
            this.importBuffer = new ImportBuffer(this.listImportsInternal.bind(this));
            this.pathResolver = new PathResolver();
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
            if (file == null || file.isNull()) {
                console.error('Trying to process imports for null file.')
                return Promise.resolve([]);
            }

            let dataUri = new DataUriPlugin();
            let options: Less.Options2 = { filename: file.path, plugins: [dataUri] };

            if (this.paths) {
                let optionsPaths: string[] = [];
                optionsPaths.push(...this.paths)
                options.paths = optionsPaths;
            }

            return this.getLessData(file)
                .then(lessData => {
                    return (<Less.RelaxedLessStatic>less)
                        .render(lessData, options)
                        .then(value => {
                            return Promise.join(Promise.resolve(value.imports),
                                (Promise.map(dataUri.imports, i => this.pathResolver.resolve(i, options.paths))));
                        })
                        .then(([fileImports, dataUriImports]) => {
                            return Promise.resolve(fileImports.concat(dataUriImports));
                        })
                        .catch(reason => {
                            let error = `Failed to process imports for '${file.path}': ${reason}`;
                            console.error(error);
                            return Promise.reject(new Error(error));
                        });
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

