import * as File from 'vinyl';
import * as fs from 'fs';
import * as less from 'less';
import * as path from 'path';
import streamToArray = require('stream-to-array');
import * as bluebird from 'bluebird';
import { FileInfo } from './import-buffer';
import { PathResolver } from './path-resolver';
import { DataUriVisitorPlugin } from './data-uri-visitor-plugin';

const fsAsync: any = bluebird.promisifyAll(fs);

const assign = require('object-assign');

module importLister {

    export interface Options {
        paths?: string[];
    }

    export class ImportLister {
        pathResolver: PathResolver;
        lessOptions: Less.Options2;

        constructor(lessOptions?: Options) {
            this.lessOptions = lessOptions;
            this.pathResolver = new PathResolver();
        }

        private async getLessData(file: File) {
            if (file.isBuffer()) {
                return new Promise<string>((resolve, reject) => {
                    process.nextTick(() => resolve(file.contents.toString()));
                });
            }

            const parts = await streamToArray(<NodeJS.ReadableStream>file.contents);
            const buffers: Buffer[] = [];
            for (let i = 0; i < parts.length; ++i) {
                const part = parts[i];
                buffers.push(Buffer.from(part));
            }
            return Buffer.concat(buffers).toString();
        }

        private async listImportsInternal(file: File): Promise<string[]> {
            if (file == null || file.isNull()) {
                console.error('Trying to process imports for null file.')
                return [];
            }

            const dataUriVisitorPlugin = new DataUriVisitorPlugin();
            const options: Less.Options2 = assign({ filename: file.path }, this.lessOptions);

            options.plugins = options.plugins ? [dataUriVisitorPlugin, ...options.plugins] : [dataUriVisitorPlugin];

            try {
                const lessData = await this.getLessData(file);
                const renderResult = await (less as Less.RelaxedLessStatic).render(lessData, options);
                const dataUriImports = await Promise.all(dataUriVisitorPlugin.imports
                    .map(i => this.pathResolver.resolve(i.directory, i.relativePath, options.paths)));
                return [...renderResult.imports, ...dataUriImports];
            }
            catch (reason) {
                const error = `Failed to process imports for '${file.path}': ${reason}`;
                console.error(error);
                throw new Error(error);
            }
        }

        private async getFileStatsIfExists(file: string) {
            try {
                const stat = await fsAsync.statAsync(file);
                return { path: file, stat: stat };
            }
            catch (error) {
                if (error.code === 'ENOENT') {
                    console.error(`Import '${file}' not found.`);
                    return null;
                }
                throw error;
            }
        }

        private async getExistingFiles(files: string[]) {
            const results = await Promise.all(files.map(this.getFileStatsIfExists));
            return results.filter(info => !!info && !!info.stat);
        }

        public async listImports(file: File): Promise<FileInfo[]> {
            if (!file) {
                return [];
            }

            const files = await this.getExistingFiles(await this.listImportsInternal(file));

            return files.map(i => { return { path: i.path, time: i.stat.mtime.getTime() } });
        }
    }
}

export = importLister;

