'use strict';

import File = require('vinyl');
import * as fs from 'fs';
import * as bluebird from 'bluebird';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as mkdirp from 'mkdirp';

const fsAsync: any = bluebird.promisifyAll(fs);
const mkdirpAsync: any = bluebird.promisify(mkdirp);

module listImports {

    export interface FileInfo {
        path: string;
        time: number;
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

        private async modifiedTimeIsTheSame(info: FileInfo): Promise<boolean> {
            try {
                const stat = await fsAsync.statAsync(info.path);
                return (stat.mtime.getTime() === info.time);
            }
            catch (error) {
                return false;
            }
        }

        private getCacheFile(filePath: string) {
            const filePathKey = `${crypto.createHash('md5').update(filePath).digest('hex')}_${path.basename(filePath)}`;
            const outputPath = path.join(os.tmpdir(), this.bufferKey);
            return path.join(outputPath, filePathKey);
        }

        private async loadPreviousResults(filePath: string): Promise<FileInfo[]> {
            let existingImports = this.importCache[filePath];
            if (existingImports) {
                return existingImports;
            }

            const cacheFile = this.getCacheFile(filePath);
            try {
                const data = await fsAsync.readFileAsync(cacheFile);
                return JSON.parse(data);
            }
            catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error(`Failed to load cached results from '${cacheFile}'. ${error}`);
                }
                return null;
            }
        }

        private async cacheResults(filePath: string, imports: FileInfo[]): Promise<FileInfo[]> {
            this.importCache[filePath] = imports;

            const cacheFile = this.getCacheFile(filePath);
            const outputPath = path.dirname(cacheFile);

            try {
                await mkdirpAsync(outputPath);
                await fsAsync.writeFileAsync(cacheFile, JSON.stringify(imports));
            }
            catch (error) {
                console.error(`Failed to cache results to '${cacheFile}'. ${error}`);
            }
            return imports;
        }

        public async listImports(file: File): Promise<FileInfo[]> {

            let useImportLister: () => Promise<FileInfo[]> = async () => {
                try {
                    const results = await this.importLister(file);
                    return await this.cacheResults(file.path, results);
                }
                catch (error) {
                    console.error(`An unknown error occurred: ${error}`);
                    return [];
                }
            }

            const existingImports = await this.loadPreviousResults(file.path);
            if (!existingImports) {
                return await useImportLister();
            }
            const results = await Promise.all(existingImports.map(this.modifiedTimeIsTheSame));
            if (results.every(r => r)) {
                return existingImports;
            }
            return await useImportLister();
        }
    }
}

export = listImports;

