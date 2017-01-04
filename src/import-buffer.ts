'use strict';

import File = require('vinyl');
import * as fs from 'fs';
import * as Promise from 'bluebird';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as mkdirp from 'mkdirp';

const fsAsync: any = Promise.promisifyAll(fs);
const mkdirpAsync: any = Promise.promisify(mkdirp);

module listImports {

    export interface FileInfo {
        path: string;
        time: number;
    }

    class ExpectedError extends Error {
         constructor(message: string) {
            super(message);

            // Set the prototype explicitly.
            Object.setPrototypeOf(this, ExpectedError.prototype);
        }
    }

    let perBufferImportCache: { [bufferKey: string]: { [path: string]: FileInfo[] } } = {};

    export class ImportBuffer {
        private importLister: (file: File) => Promise<FileInfo[]>;
        private importCache: { [path: string]: FileInfo[] };

        constructor(importLister: (file: File) => Promise<FileInfo[]>, private bufferKey: string) {
            if (!importLister || !(importLister instanceof Function)) {
                throw new Error('Invalid importer.');
            }
            if (!bufferKey) {
                throw new Error('A buffer key is required.');
            }

            this.importLister = importLister;
            this.importCache = perBufferImportCache[bufferKey];
            if (!this.importCache) {
                this.importCache = perBufferImportCache[bufferKey] = {};
            }
        }

        private modifiedTimeIsTheSame(info: FileInfo): Promise<any> {
            return fsAsync.statAsync(info.path)
                .then((stat: fs.Stats): boolean => {
                    let same = stat.mtime.getTime() === info.time;
                    if (!same) {
                        throw new ExpectedError('changed');
                    }
                    return true;
                })
                .catch(ExpectedError, (err: ExpectedError) => { throw err; })
                .catch((err: any) => {
                    // if this is an ongoing error it will be reported next time around.
                    throw new ExpectedError('changed');
                });
        }

        private getCacheFile(filePath: string) {
            const filePathKey = `${crypto.createHash('md5').update(filePath).digest('hex')}_${path.basename(filePath)}`;
            const outputPath = path.join(os.tmpdir(), this.bufferKey);
            return path.join(outputPath, filePathKey);
        }

        private loadPreviousResults(filePath: string): Promise<FileInfo[]> {
            let existingImports = this.importCache[filePath];
            if (existingImports) {
                return Promise.resolve(existingImports);
            }

            const cacheFile = this.getCacheFile(filePath);
            return fsAsync.readFileAsync(cacheFile)
                .then((data: string) => {
                    return JSON.parse(data);
                })
                .catch(Error, (error: NodeJS.ErrnoException) => {
                    if (error.code !== 'ENOENT') {
                        console.error(`Failed to load cached results from '${cacheFile}'. ${error}`);
                    }
                    return <FileInfo[]>null;
                });
        }

        private cacheResults(filePath: string, imports: FileInfo[]): Promise<FileInfo[]> {
            this.importCache[filePath] = imports;

            const cacheFile = this.getCacheFile(filePath);
            const outputPath = path.dirname(cacheFile);

            return mkdirpAsync(outputPath)
                .then(() => fsAsync.writeFileAsync(cacheFile, JSON.stringify(imports)))
                .catch((error: any) => {
                    console.error(`Failed to cache results to '${cacheFile}'. ${error}`);
                    return imports;
                })
                .then(() => imports);
        }

        public listImports(file: File): Promise<FileInfo[]> {

            let useImportLister: () => Promise<FileInfo[]> = () => {
                return this.importLister(file)
                    .then(results => this.cacheResults(file.path, results))
                    .catch(error => {
                        console.error(`An unknown error occurred: ${error}`);
                        return [];
                    });
            }

            return this.loadPreviousResults(file.path)
                .then(existingImports => {
                    if (existingImports) {
                        return Promise.all(existingImports.map(this.modifiedTimeIsTheSame))
                            .then((results) => {
                                return existingImports;
                            })
                            .catch(ExpectedError, () => {
                                return useImportLister();
                            });
                    }
                    return useImportLister();
                });
        }
    }
}

export = listImports;

