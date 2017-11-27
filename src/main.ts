'use strict';

import * as bluebird from 'bluebird';
import * as through from 'through2';
import * as fs from 'fs';
import * as gutil from 'gulp-util';
import { ImportLister } from './import-lister';
import { ImportBuffer, FileInfo } from './import-buffer';
import File = require('vinyl');
import * as crypto from 'crypto';
import { start } from 'repl';
import { Transform } from 'stream';

const fsAsync: any = bluebird.promisifyAll(fs);

const MODULE_NAME = 'gulp-less-changed';

module gulpLessChanged {

    export interface PluginOptions {
        paths?: string[];
        getOutputFileName?: (input: string) => string;
    }

    interface IntermediateResult {
        outputAge: Date,
        changed: boolean
    }

    class ImportChecker {
        private getOutputFileName: (input: string) => string;
        constructor(private options: PluginOptions, private importBuffer: ImportBuffer) {
            this.getOutputFileName = options.getOutputFileName || (input => gutil.replaceExtension(input, '.css'));
        }

        private async checkImportsHaveChanged(file: File, mainFileDate: Date) {

            function importHasChanged(importFile: FileInfo): boolean {
                return importFile.time > mainFileDate.getTime();
            }

            try {
                const imports = await this.importBuffer.listImports(file);
                return imports.some(importHasChanged);
            } catch (error) {
                console.error(error);
                return true;
            }
        }

        private async hasFileChanged(inputFile: File, outputFilePath: string) {
            try {
                const stats = await fsAsync.statAsync(outputFilePath);
                return { modifiedTime: stats.mtime, hasFileChanged: stats.mtime < inputFile.stat.mtime };
            } catch (error) {
                if (error.code === 'ENOENT') {
                    return { modifiedTime: undefined, hasFileChanged: true };
                } else {
                    throw error;
                }
            }
        }

        private async hasFileOrDependenciesChanged(
            inputFile: File,
            outputFilePath: string) {

            const { modifiedTime, hasFileChanged } = await this.hasFileChanged(inputFile, outputFilePath);
            if (hasFileChanged) {
                return true;
            }

            return await this.checkImportsHaveChanged(inputFile, modifiedTime);
        }

        public async checkFileForChanges(
            transform: Transform,
            file: File, enc: string, callback: (error: any, data: any) => any) {

            if (file.isNull()) {
                callback(null, null);
                return;
            }

            try {
                const changed = await this.hasFileOrDependenciesChanged(file, this.getOutputFileName(file.path));

                if (changed) {
                    transform.push(file);
                }
            }
            catch (error) {
                transform.emit('error', new gutil.PluginError(MODULE_NAME, `Error processing \'${file.path}\': ${error}`));
            }
            finally {
                callback(null, null);
            }
        }
    }

    export function run(options?: gulpLessChanged.PluginOptions) {
        options = options || {};

        const importLister = new ImportLister(options);

        const instanceKey = crypto.createHash('md5').update(__dirname + JSON.stringify(options)).digest('hex');
        const bufferKey = `${MODULE_NAME}-${instanceKey}`;
        const importBuffer = new ImportBuffer(importLister.listImports.bind(importLister), bufferKey);

        const importChecker = new ImportChecker(options, importBuffer);

        return through.obj(function (file: File, enc: string, callback: (error: any, data: any) => any) {
            importChecker.checkFileForChanges(this, file, enc, callback);
        });
    }
}

module.exports = gulpLessChanged.run;