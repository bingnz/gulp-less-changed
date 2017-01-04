'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as Promise from 'bluebird';

const fsAsync: any = Promise.promisifyAll(fs);

module pathResolver {
    export class PathResolverError extends Error {
        message: string;
        constructor(message: string) {
            super(message);
            this.message = message;
            this.name = (<any>this).constructor.name;
            // Set the prototype explicitly.
            Object.setPrototypeOf(this, PathResolverError.prototype);
            (<any>Error).captureStackTrace(this, this.name);
        }
    }

    export class PathResolver {
        public resolve(currentDirectory: string, inputPath: string, searchPaths: string[]): Promise<string> {
            let pathsToTry = [path.join(currentDirectory, inputPath)];

            if (searchPaths) {
                pathsToTry.push(...searchPaths.map(p => path.join(p, inputPath)));
            }

            pathsToTry.push(path.join(process.cwd(), inputPath));

            return Promise.map(pathsToTry, path =>
                fsAsync.statAsync(path)
                    .then((stat: fs.Stats) => path)
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
                        throw new PathResolverError(`Import file '${inputPath}' wasn't found. Tried: ${triedPathsDisplay}.`);
                    }
                    return result;
                });
        }
    }
}

export = pathResolver;

