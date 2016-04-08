'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as Promise from 'bluebird';

const fsAsync = Promise.promisifyAll(fs);

module pathResolver {
    export class PathResolverError extends Error {
        message: string;
        constructor(message: string) {
            super(message);
            this.message = message;
            this.name = (<any>this).constructor.name;
            (<any>Error).captureStackTrace(this, this.name);
        }
    }

    export class PathResolver {
        public resolve(inputPath: string, searchPaths: string[]): Promise<string> {
            let fileName = path.basename(inputPath);
 
            let pathsToTry = [inputPath];

            if (searchPaths) {
                pathsToTry.push(...searchPaths.map(p => path.join(p, fileName)));
            }

            pathsToTry.push(path.join(process.cwd(), fileName));

            return Promise.map(pathsToTry, path =>
                fsAsync.statAsync(path)
                    .then((stat: fs.Stats) => Promise.resolve(path))
                    .catch((error: any) => {
                        return <string>null;
                    }))
                .then(paths => {
                    let index = -1;
                    let foundPath = paths.some((path, i) => {
                        let found = path !== null;
                        if (found) {
                            index = i;
                        }
                        return found;
                    }) ? paths[index] : null;
                    return foundPath;
                })
                .then(result => {
                    if (result === null) {
                        let triedPathsDisplay = pathsToTry.map(p => `'${p}'`).join(', ');
                        return Promise.reject(new PathResolverError(`Import file '${inputPath}' wasn't found. Tried: ${triedPathsDisplay}.`));
                    }
                    return result;
                });
        }
    }
}

export = pathResolver;

