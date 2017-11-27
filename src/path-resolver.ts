import * as fs from 'fs';
import * as path from 'path';
import * as bluebird from 'bluebird';

const fsAsync: any = bluebird.promisifyAll(fs);

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
        private async filterExistingPaths(pathsToTry: string[]) {
            const checkedPaths = await Promise.all(pathsToTry.map(async path => {
                try {
                    await fsAsync.statAsync(path);
                    return path;
                } catch (error) {
                    return null as string;
                }
            }));
            return checkedPaths.filter(path => !!path);
        }

        public async resolve(currentDirectory: string, inputPath: string, searchPaths: string[]): Promise<string> {
            let pathsToTry = [path.join(currentDirectory, inputPath)];

            if (searchPaths) {
                pathsToTry.push(...searchPaths.map(p => path.join(p, inputPath)));
            }

            pathsToTry.push(path.join(process.cwd(), inputPath));
            const resolvedPaths = await this.filterExistingPaths(pathsToTry);

            const validPath = resolvedPaths[0];
            if (!validPath) {
                const triedPathsDisplay = pathsToTry.map(p => `'${p}'`).join(', ');
                throw new PathResolverError(`Import file '${inputPath}' wasn't found. Tried: ${triedPathsDisplay}.`);
            }

            return validPath;
        }
    }
}

export = pathResolver;

