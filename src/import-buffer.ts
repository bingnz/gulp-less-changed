'use strict';

import File = require('vinyl');
import * as fs from 'fs';
import * as Promise from 'bluebird';

const fsAsync = Promise.promisifyAll(fs);

module listImports {

    export interface FileInfo {
        path: string;
        stat: fs.Stats;
    }

    class ExpectedError extends Error {
    };

    export class ImportBuffer {
        private importLister: (file: File) => Promise<string[]>;
        private importCache: { [path: string]: FileInfo[] } = {};

        constructor(importLister: (file: File) => Promise<string[]>) {
            if (!importLister || !(importLister instanceof Function)) {
                throw new ExpectedError('Invalid importer.');
            }
            this.importLister = importLister;
        }

        private modifiedTimeIsTheSame(info: FileInfo): Promise<any> {
            return fsAsync.statAsync(info.path)
                .then((stat: fs.Stats): Promise<any> => {
                    let same = stat.mtime.getTime() === info.stat.mtime.getTime();
                    if (!same) {
                        return Promise.reject(new ExpectedError('changed'));
                    }
                    return Promise.resolve(same);
                })
                .catch(() => {
                    // if this is an ongoing error it will be reported next time around.
                    return Promise.reject(new ExpectedError('changed'));
                });
        }

        public listImports(file: File): Promise<FileInfo[]> {

            let useImportLister: () => Promise<FileInfo[]> = () => {
                return this.importLister(file)
                    .then((files: string[]) => {
                        return Promise.map(files, file =>
                            fsAsync.statAsync(file)
                                .catch(Error, (error: NodeJS.ErrnoException) => {
                                    if (error.code === 'ENOENT') {
                                        console.error(`Import '${file}' not found.`);
                                        return Promise.resolve(null);
                                    }
                                    return Promise.reject(error);
                                })
                                .then((stat: fs.Stats) => { return { path: file, stat: stat } }))

                    })
                    .then((results: FileInfo[]) => {
                        let successfulResults = results.filter(info => !!info.stat);
                        this.importCache[file.path] = successfulResults;
                        return successfulResults;
                    })
                    .catch(error => {
                        console.error(`An unknown error occurred: ${error}`);
                        return [];
                    });
            }

            let existingImports = this.importCache[file.path];
            if (existingImports) {
                return Promise.all(existingImports.map(this.modifiedTimeIsTheSame))
                    .then((results) => {
                        return Promise.resolve(this.importCache[file.path]);
                    })
                    .catch(ExpectedError, () => {
                        return useImportLister();
                    });
            }
            return useImportLister();
        }
    }
}

export = listImports;

