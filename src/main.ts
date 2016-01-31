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
        fs.stat(outputFile, (error: NodeJS.ErrnoException, stats: fs.Stats): void => {
            if (error) {
                if (error.code === 'ENOENT') {
                    return callback(null, file);
                }
                else {
                    this.emit('error', new gutil.PluginError(MODULE_NAME, 'Error processing \'' + file.path + '\': ' + error));
                    return callback(null, null);
                }
            }

            if (stats.mtime < file.stat.mtime) {
                this.emit(file);
            }

            return callback(null, null);
        });
    }
}

export = gulpLessChanged;