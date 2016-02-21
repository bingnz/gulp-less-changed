'use strict';

import * as through from 'through2';
import * as q from 'q';
import * as fs from 'fs'
import * as gutil from 'gulp-util';
import vinyl = require('vinyl');

const MODULE_NAME = 'gulp-less-changed';

function gulpLessChanged(options?: gulpLessChanged.PluginOptions): NodeJS.ReadWriteStream {
    return through.obj(gulpLessChanged.transform);
}

module gulpLessChanged {
    export interface PluginOptions {
    }

    export function transform(file: vinyl, enc: string, callback: (error: any, data: any) => any) {

        if (file.isNull()) {
            return callback(null, null);
        }

        let outputFile = gutil.replaceExtension(file.path, '.css');

        q.nfcall(fs.stat.bind(fs), outputFile)
            .then((stats: fs.Stats) => {
                if (stats.mtime < file.stat.mtime) {
                    return callback(null, file);
                }
                callback(null, null);
            },
            (error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') {
                    return callback(null, file);
                }

                this.emit('error', new gutil.PluginError(MODULE_NAME, 'Error processing \'' + file.path + '\': ' + error));
                callback(null, null);
            });
    }
}

export = gulpLessChanged;