'use strict';

import * as through from 'through2';
import * as q from 'q';
import * as fs from 'fs'
import * as gutil from 'gulp-util';
import * as ListImports from './list-imports';
import * as async from 'async-q';
import vinyl = require('vinyl');

const MODULE_NAME = 'gulp-less-changed';

function gulpLessChanged(options?: gulpLessChanged.PluginOptions): NodeJS.ReadWriteStream {
    return through.obj(gulpLessChanged.transform);
}

module gulpLessChanged {
    export interface PluginOptions {
    }

    function checkImportsHaveChanged(file: vinyl) {
        function importHasChanged(file: vinyl, path: string): Q.Promise<boolean> {
            return q.nfcall(fs.stat.bind(fs), path)
                .then((stats: fs.Stats) => {
                    return stats.mtime > file.stat.mtime;
                });
        }

        function fileImportHasChanged(path: string): Q.Promise<boolean> {
            return importHasChanged(file, path);
        }

        return ListImports.listImports(file)
            .then(imports => {
                return async.some(imports, fileImportHasChanged);
            })
    }

    export function transform(file: vinyl, enc: string, callback: (error: any, data: any) => any) {

        if (file.isNull()) {
            return callback(null, null);
        }

        let outputFile = gutil.replaceExtension(file.path, '.css');

        q.nfcall(fs.stat.bind(fs), outputFile)
            .then((stats: fs.Stats) => {
                if (stats.mtime < file.stat.mtime) {
                    this.push(file);
                    return true;
                }
            }, (error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') {
                    this.push(file);
                    return true;
                }

                this.emit('error', new gutil.PluginError(MODULE_NAME, 'Error processing \'' + file.path + '\': ' + error));
                return false;
            })
            .then((emittedFile: boolean) => {
                if (emittedFile) {
                    return false;
                }

                return checkImportsHaveChanged(file).catch(reason => false);
            })
            .then((importsHaveChanged: boolean) => {
                if (importsHaveChanged) {
                    this.push(file);
                }
            })
            .then(() => callback(null, null));
    }
}

export = gulpLessChanged;