'use strict';

import * as path from 'path';
import * as Promise from 'bluebird';

module pathResolver {

    export class PathResolver {
        public resolve(relativePath: string, searchPaths: string[]): Promise<string> {
            return Promise.resolve(relativePath);
        }
    }
}

export = pathResolver;

