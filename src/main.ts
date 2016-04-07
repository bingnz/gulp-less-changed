'use strict';

import * as Promise from 'bluebird';
import * as through from 'through2';
import * as fs from 'fs';
import * as gutil from 'gulp-util';
import { ImportLister } from './import-lister';
import { FileInfo } from './import-buffer';
import File = require('vinyl');

const fsAsync = Promise.promisifyAll(fs);

const MODULE_NAME = 'gulp-less-changed';

module gulpLessChanged {

    export interface PluginOptions {
        paths?: string[];
        getOutputFileName?: (input: string) => string;
    }

    function checkImportsHaveChanged(file: File, mainFileDate: Date, importLister: ImportLister) {

        function importHasChanged(importFile: FileInfo): boolean {
            return importFile.stat.mtime > mainFileDate;
        }

        return importLister.listImports(file)
            .then(imports => {
                return imports.some(importHasChanged);
            })
    }

    interface IntermediateResult {
        outputAge: Date,
        changed: boolean
    }

    export function run(options?: gulpLessChanged.PluginOptions) {
        options = options || {};
        let getOutputFileName = options.getOutputFileName || (input => gutil.replaceExtension(input, '.css'));
        let importLister = new ImportLister(options.paths);

        function transform(file: File, enc: string, callback: (error: any, data: any) => any) {

            if (file.isNull()) {
                return callback(null, null);
            }

            let outputFile = getOutputFileName(file.path);

            fsAsync.statAsync(outputFile)
                .then((stats: fs.Stats) => {
                    if (stats.mtime < file.stat.mtime) {
                        this.push(file);
                        return { outputAge: stats.mtime, changed: true };
                    }

                    return { outputAge: stats.mtime, changed: false };
                }, (error: NodeJS.ErrnoException): IntermediateResult => {
                    if (error.code === 'ENOENT') {
                        this.push(file);
                        return { outputAge: null, changed: true };
                    }

                    throw error;
                })
                .then((intermediateResult: IntermediateResult) => {
                    if (intermediateResult.changed) {
                        return Promise.resolve(false);
                    }

                    return checkImportsHaveChanged(file, intermediateResult.outputAge, importLister);
                })
                .then((importsHaveChanged: boolean) => {
                    if (importsHaveChanged) {
                        this.push(file);
                    }
                })
                .then(() => callback(null, null))
                .catch((error: any) => {
                    this.emit('error', new gutil.PluginError(MODULE_NAME, `Error processing \'${file.path}\': ${error}`));
                    callback(null, null);
                });
        }

        return through.obj(transform);
    }
}

module.exports = gulpLessChanged.run;