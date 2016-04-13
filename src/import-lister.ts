'use strict';

import File = require('vinyl');
import * as less from 'less';
import * as path from 'path';
import streamToArray = require('stream-to-array');
import * as Promise from 'bluebird';
import { ImportBuffer, FileInfo } from './import-buffer';
import { PathResolver } from './path-resolver';
import { DataUriVisitorPlugin } from './data-uri-visitor-plugin';

const assign = require('object-assign');

module importLister {

    export interface Options {
        paths?: string[];
    }

    export class ImportLister {
        importBuffer: ImportBuffer;
        pathResolver: PathResolver;
        lessOptions: Less.Options2;

        constructor(lessOptions?: Options) {
            this.lessOptions = lessOptions;
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

            let dataUriVisitorPlugin = new DataUriVisitorPlugin();
            let options: Less.Options2 = assign({ filename: file.path }, this.lessOptions);

            options.plugins = options.plugins ? [dataUriVisitorPlugin, ...options.plugins] : [dataUriVisitorPlugin];

            return this.getLessData(file)
                .then(lessData => {
                    return (<Less.RelaxedLessStatic>less)
                        .render(lessData, options)
                        .then(value => {
                            return Promise.join(Promise.resolve(value.imports),
                                (Promise.map(dataUriVisitorPlugin.imports, i => this.pathResolver.resolve(i.directory, i.relativePath, options.paths))));
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

